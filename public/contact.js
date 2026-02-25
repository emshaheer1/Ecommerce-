document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear().toString();

  const form = document.getElementById('contact-form');
  const messageEl = document.getElementById('contact-form-message');

  if (form && messageEl) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      messageEl.hidden = true;
      messageEl.textContent = '';
      messageEl.className = 'contact-form-message';

      messageEl.textContent = 'Thank you! Your message has been received. We\'ll get back to you soon.';
      messageEl.classList.add('success');
      messageEl.hidden = false;
      form.reset();
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
});
