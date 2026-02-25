document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signup-form');
  const messageEl = document.getElementById('auth-message');
  const btn = document.getElementById('signup-btn');

  if (!form || !messageEl || !btn) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.hidden = true;
    messageEl.textContent = '';
    messageEl.className = 'auth-message';

    const formData = new FormData(form);
    const name = formData.get('name')?.toString().trim();
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString();

    if (!name || !email || !password) {
      messageEl.textContent = 'Please complete all fields.';
      messageEl.classList.add('error');
      messageEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const res = await fetch('/api/admin/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to create account. Please try again.');
      }

      messageEl.textContent = 'Account created successfully. Redirecting to dashboard...';
      messageEl.classList.add('success');
      messageEl.hidden = false;
      setTimeout(() => {
        window.location.href = '/admin';
      }, 1500);
    } catch (e) {
      console.error(e);
      messageEl.textContent =
        e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      messageEl.classList.add('error');
      messageEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create account';
    }
  });
});

