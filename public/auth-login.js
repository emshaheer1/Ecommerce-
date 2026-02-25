document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const messageEl = document.getElementById('auth-message');
  const btn = document.getElementById('login-btn');

  if (!form || !messageEl || !btn) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.hidden = true;
    messageEl.textContent = '';
    messageEl.className = 'auth-message';

    const formData = new FormData(form);
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString();

    if (!email || !password) {
      messageEl.textContent = 'Please enter your email and password.';
      messageEl.classList.add('error');
      messageEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid email or password.');
      }

      window.location.href = '/admin';
    } catch (e) {
      console.error(e);
      messageEl.textContent =
        e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      messageEl.classList.add('error');
      messageEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  });
});

