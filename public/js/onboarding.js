/* ============================================================
   Nebula Onboarding Flow Guard
   Keeps users on track: welcome -> login -> facebook/google -> user
   Editing the URL directly skips back to welcome.html.
   ============================================================ */
(function () {
  const KEY = {
    welcome: 'nebula_seen_welcome',
    login: 'nebula_seen_login',
    authed: 'nebula_authed'
  };

  window.NebulaFlow = {
    markWelcomeSeen() { sessionStorage.setItem(KEY.welcome, '1'); },
    markLoginSeen() { sessionStorage.setItem(KEY.login, '1'); },
    markAuthed(provider) {
      sessionStorage.setItem(KEY.authed, '1');
      if (provider) sessionStorage.setItem('nebula_provider', provider);
    },
    hasSeenWelcome() { return sessionStorage.getItem(KEY.welcome) === '1'; },
    hasSeenLogin() { return sessionStorage.getItem(KEY.login) === '1'; },
    isAuthed() { return sessionStorage.getItem(KEY.authed) === '1'; },
    provider() { return sessionStorage.getItem('nebula_provider') || ''; },

    // Redirect helpers — call at top of each gated page
    requireWelcomeSeen() {
      if (!this.hasSeenWelcome()) location.replace('welcome.html');
    },
    requireLoginSeen() {
      if (!this.hasSeenWelcome() || !this.hasSeenLogin()) location.replace('welcome.html');
    },
    requireAuthed() {
      if (!this.isAuthed()) location.replace('welcome.html');
    }
  };
})();
