export function ThemeScript() {
  const script = `
    (function() {
      try {
        var storedTheme = localStorage.getItem('crm-theme');
        var theme = storedTheme === 'dark' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', theme === 'dark');
      } catch (error) {
        document.documentElement.classList.remove('dark');
      }
    })();
  `

  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
