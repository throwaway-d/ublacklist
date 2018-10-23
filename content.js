class UBlacklist {
  constructor() {
    this.blockRules = null;
    this.blockedSiteCount = 0;
    this.queuedSites = [];

    loadBlockRules(blockRules => {
      this.onBlockRulesLoaded(blockRules);
    });

    new MutationObserver(records => {
      this.onDOMContentMutated(records);
    }).observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('DOMContentLoaded', () => {
      this.onDOMContentLoaded();
    });
  }

  onBlockRulesLoaded(blockRules) {
    this.blockRules = blockRules;
    for (const site of this.queuedSites) {
      this.judgeSite(site);
    }
    this.queuedSites = [];
  }

  onDOMContentMutated(records) {
    if (!document.getElementById('ubShowStyle') && document.head) {
      this.setupStyleSheets();
    }
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.matches && node.matches('.g:not(.g-blk), g-inner-card, .dbsr:not(.kno-fb-ctx)')) {
          this.setupBlockLinks(node);
          if (this.blockRules) {
            this.judgeSite(node);
          } else {
            this.queuedSites.push(node);
          }
        }
      }
    }
    this.updateControl();
  }

  onDOMContentLoaded() {
    this.setupControl();
    this.setupBlockDialogs();
  }

  setupStyleSheets() {
    const hideStyle = document.createElement('style');
    document.head.appendChild(hideStyle);
    hideStyle.sheet.insertRule('#ubHideLink { display: none; }');
    hideStyle.sheet.insertRule('.ubBlockedSiteContainer { display: none !important; }');
    hideStyle.sheet.insertRule('.ubUnblockLink { display: none; }');

    const showStyle = document.createElement('style');
    document.head.appendChild(showStyle);
    showStyle.sheet.insertRule('#ubShowLink { display: none; }');
    showStyle.sheet.insertRule('#ubHideLink { display: inline; }');
    showStyle.sheet.insertRule('.ubBlockedSiteContainer { display: block !important; }');
    showStyle.sheet.insertRule('.ubBlockedSiteContainer, .ubBlockedSiteContainer * { background-color: #ffe0e0; }');
    showStyle.sheet.insertRule('.ubBlockedSiteContainer .ubBlockLink { display: none; }');
    showStyle.sheet.insertRule('.ubBlockedSiteContainer .ubUnblockLink { display: inline; }');

    showStyle.id = 'ubShowStyle';
    showStyle.sheet.disabled = true;
  }

  setupBlockLinks(site) {
    const siteLink = this.getSiteLink(site);
    const blockLinkContainer = this.createBlockLinkContainer(site);
    if (siteLink && blockLinkContainer) {
      const blockLink = document.createElement('a');
      blockLink.className = 'ubBlockLink';
      blockLink.href = 'javascript:void(0)';
      blockLink.textContent = _('blockThisSite');
      blockLink.addEventListener('click', () => {
        if (this.blockRules) {
          document.getElementById('ubBlockInput').value = makeMatchPattern(siteLink.href);
          document.getElementById('ubBlockDialog').showModal();
        }
      });

      const unblockLink = document.createElement('a');
      unblockLink.className = 'ubUnblockLink';
      unblockLink.href = 'javascript:void(0)';
      unblockLink.textContent = _('unblockThisSite');
      unblockLink.addEventListener('click', () => {
        if (this.blockRules) {
          const unblockSelect = document.getElementById('ubUnblockSelect');
          while (unblockSelect.firstChild) {
            unblockSelect.removeChild(unblockSelect.firstChild);
          }
          this.blockRules.forEach((rule, index) => {
            if (rule.compiled && rule.compiled.test(siteLink.href)) {
              const option = document.createElement('option');
              option.textContent = rule.raw;
              option.value = String(index);
              unblockSelect.appendChild(option);
            }
          });
          document.getElementById('ubUnblockDialog').showModal();
        }
      });

      blockLinkContainer.appendChild(blockLink);
      blockLinkContainer.appendChild(unblockLink);
    }
  }

  setupControl() {
    const resultStats = document.getElementById('resultStats');
    if (resultStats) {
      const stats = document.createElement('span');
      stats.id = 'ubStats';

      const showLink = document.createElement('a');
      showLink.id = 'ubShowLink';
      showLink.href = 'javascript:void(0)';
      showLink.textContent = _('show');
      showLink.addEventListener('click', () => {
        document.getElementById('ubShowStyle').sheet.disabled = false;
      });

      const hideLink = document.createElement('a');
      hideLink.id = 'ubHideLink';
      hideLink.href = 'javascript:void(0)';
      hideLink.textContent = _('hide');
      hideLink.addEventListener('click', () => {
        document.getElementById('ubShowStyle').sheet.disabled = true;
      });

      const control = document.createElement('span');
      control.id = 'ubControl';
      control.appendChild(stats);
      control.appendChild(document.createTextNode('\u00a0'));
      control.appendChild(showLink);
      control.appendChild(hideLink);

      resultStats.appendChild(control);

      this.updateControl();
    }
  }

  setupBlockDialogs() {
    document.body.insertAdjacentHTML('beforeend', String.raw`
      <dialog id="ubBlockDialog">
        <form id="ubBlockForm">
          <label>
            ${_('blockThisSite')}:
            <input id="ubBlockInput" type="text" spellcheck="false">
          </label>
          <button type="submit">${_('ok')}</button>
        </form>
      </dialog>
      <dialog id="ubUnblockDialog">
        <form id="ubUnblockForm">
          <label>
            ${_('unblockThisSite')}:
            <select id="ubUnblockSelect">
            </select>
          </label>
          <button type="submit">${_('ok')}</button>
        </form>
      </dialog>
    `);

    const blockDialog = document.getElementById('ubBlockDialog');
    document.getElementById('ubBlockForm').addEventListener('submit', event => {
      event.preventDefault();
      const raw = document.getElementById('ubBlockInput').value;
      const compiled = compileBlockRule(raw);
      if (compiled) {
        this.blockRules.push({ raw, compiled });
        this.rejudgeAllSites();
        saveBlockRules(this.blockRules);
      }
      blockDialog.close();
    });
    blockDialog.addEventListener('click', event => {
      if (event.target == blockDialog) {
        blockDialog.close();
      }
    });

    const unblockDialog = document.getElementById('ubUnblockDialog');
    document.getElementById('ubUnblockForm').addEventListener('submit', event => {
      event.preventDefault();
      this.blockRules.splice(Number(document.getElementById('ubUnblockSelect').value), 1);
      this.rejudgeAllSites();
      saveBlockRules(this.blockRules);
      unblockDialog.close();
    });
    unblockDialog.addEventListener('click', event => {
      if (event.target == unblockDialog) {
        unblockDialog.close();
      }
    });
  }

  getType(site) {
    if (site.matches('g-inner-card')) {
      if (site.matches('g-scrolling-carousel *')) {
        return 'card';
      } else {
        return 'listcard';
      }
    }
    if (site.matches('.dbsr')) {
      return 'list';
    }
    if (site.matches('.g-blk *')) {
      return 'featured';
    }
    return 'normal';
  }

  getSiteLink(site) {
    return site.querySelector('a[href^="https://books.google."]') || site.querySelector('a[ping]');
  }

  createBlockLinkContainer(site) {
    const type = this.getType(site);
    if (type == 'card') {
      const container = document.createElement('div');
      container.className = 'ubCardBlockLinkContainer';
      site.appendChild(container);
      return container;
    }
    if (type == 'listcard') {
      const containerParent = site.querySelector('g-card-section > div');
      if (containerParent) {
        const container = document.createElement('span');
        container.className = 'ubNormalBlockLinkContainer';
        containerParent.appendChild(container);
        return container;
      }
      return null;
    }
    if (type == 'list') {
      return site.querySelector('a > div > div:last-child > div:nth-child(2)');
    }
    const containerParent =
      /* Search (the New Version), Book Search or Video Search */
      // div.g
      //  |-div
      //     |-div.rc
      //        |-div.r                 <- Container Parent
      //           |-a
      //              |-h3
      //              |-br
      //              |-div
      //                 |-cite
      //           |-                   <- Container
      //        |-div.s
      //           |-div
      //              |-div.slp.f *     <- ATTENTION!
      //              |-span.st
      //                 |-span.f
      //        |-div
      site.querySelector('div.r') ||
      /* News Search */
      // div.g
      //  |-div.ts
      //      |-a
      //         |-div.f *              <- ATTENTION!
      //      |-div
      //         |-h3.r
      //            |-a
      //         |-div.slp              <- Container Parent
      //            |-span
      //            |-span
      //            |-span.f
      //            |-                  <- Container
      //         |-div.st
      site.querySelector('div.slp:not(.f)') ||
      /* Search (the Old Version): No Longer Used? */
      // div.g
      //  |-div
      //     |-div.rc
      //        |-h3.r
      //           |-a
      //        |-div.s
      //           |-div
      //              |-div.f           <- Container Parent
      //                 |-cite
      //                 |-             <- Container
      //              |-div.slp.f *     <- ATTENTION!
      //        |-div
      site.querySelector('div.f');
    if (containerParent) {
      const container = document.createElement('span');
      container.className = 'ubNormalBlockLinkContainer';
      containerParent.appendChild(container);
      return container;
    }
    return null;
  }

  getContainer(site) {
    const type = this.getType(site);
    if (type == 'card') {
      return site.closest('div') || site;
    }
    if (type == 'listcard') {
      return site.closest('div') || site;
    }
    if (type == 'list') {
      return site.closest('g-section-with-header > div > div > div > div') || site;
    }
    if (type == 'featured') {
      return site.closest('.g-blk');
    }
    return site;
  }

  judgeSite(site) {
    const siteLink = this.getSiteLink(site);
    if (siteLink && this.blockRules.some(rule => rule.compiled && rule.compiled.test(siteLink.href))) {
      this.getContainer(site).classList.add('ubBlockedSiteContainer');
      ++this.blockedSiteCount;
    }
  }

  rejudgeAllSites() {
    this.blockedSiteCount = 0;
    for (const site of document.querySelectorAll('.g:not(.g-blk), g-inner-card, .dbsr:not(.kno-fb-ctx)')) {
      this.getContainer(site).classList.remove('ubBlockedSiteContainer');
      this.judgeSite(site);
    }
    this.updateControl();
  }

  updateControl() {
    const control = document.getElementById('ubControl');
    if (control) {
      if (this.blockedSiteCount) {
        const stats = document.getElementById('ubStats');
        stats.textContent = chrome.i18n.getMessage('nSitesBlocked', String(this.blockedSiteCount));
        control.style.display = 'inline';
      } else {
        control.style.display = 'none';
        document.getElementById('ubShowStyle').sheet.disabled = true;
      }
    }
  }
}

new UBlacklist();