export function initializeTheme(button) {
    let theme = 'light';
    try { theme = localStorage.getItem('inkmap-theme') === 'dark' ? 'dark' : 'light'; } catch {}
    const apply = () => {
        document.documentElement.dataset.theme = theme;
        button.textContent = theme === 'dark' ? '☀ Светлая тема' : '☾ Тёмная тема';
        button.setAttribute('aria-pressed', String(theme === 'dark'));
    };
    apply();
    button.onclick = () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        apply();
        try { localStorage.setItem('inkmap-theme', theme); } catch {}
    };
}
