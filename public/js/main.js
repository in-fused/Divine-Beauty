const cards = document.querySelectorAll('[data-slot-card]');

cards.forEach((card) => {
  const toggle = card.querySelector('[data-slot-toggle]');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    card.classList.toggle('open');
  });

  const form = card.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', () => {
    card.classList.add('slot-selected');
  });

  const phone = form.querySelector('[data-customer-phone]');
  const email = form.querySelector('[data-customer-email]');

  async function lookup() {
    if (!phone?.value && !email?.value) return;
    const params = new URLSearchParams({ phone: phone?.value || '', email: email?.value || '' });
    const result = await fetch(`/api/customer-lookup?${params.toString()}`);
    if (!result.ok) return;
    const payload = await result.json();
    if (!payload.found) return;

    const nameEl = form.querySelector('input[name="name"]');
    const notesEl = form.querySelector('textarea[name="customNotes"]');
    if (nameEl && !nameEl.value) nameEl.value = payload.customer.name || '';
    if (notesEl && !notesEl.value && payload.customer.notes) notesEl.value = payload.customer.notes;
  }

  phone?.addEventListener('blur', lookup);
  email?.addEventListener('blur', lookup);
});
