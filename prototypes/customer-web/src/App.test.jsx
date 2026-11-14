import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.jsx';

describe('Mobile Bazaar homepage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    document.documentElement.lang = 'fr';
    document.documentElement.dir = 'ltr';
  });

  it('switches the document into Arabic RTL', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'العربية' }));
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ابحث');
  });

  it('supports keyboard selection in search suggestions', async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByRole('combobox', { name: 'Rechercher dans le catalogue' });
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue('smartphone 5G');
  });

  it('selects a delivery location', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Changer le lieu de livraison/ }));
    expect(screen.getByRole('dialog')).toBeVisible();
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[2], '1');
    await user.click(screen.getByRole('button', { name: 'Confirmer le lieu' }));
    expect(screen.getByRole('button', { name: /Bab Ezzouar/ })).toBeVisible();
  });

  it('adds an available offer without duplicating the action', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Friteuse sans huile 5 L', {}, { timeout: 1500 });
    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Panier: 1' })).toBeVisible());
    await waitFor(() => expect(screen.getByText(/Ajouté au panier/)).toBeVisible());
  });

  it('navigates from search to a matching product detail', async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByRole('combobox', { name: 'Rechercher dans le catalogue' });
    await user.type(input, 'smartphone 5G');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByRole('heading', { level: 1, name: /Résultats pour/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Voir le produit: Smartphone 5G/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Smartphone 5G 128 Go' })).toBeVisible();
  });

  it('completes the connected COD checkout and opens its order', async () => {
    window.history.replaceState({}, '', '/product/air-fryer-5l');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.click(screen.getByRole('button', { name: 'Panier: 1' }));
    await user.click(screen.getByRole('button', { name: /Passer au paiement/ }));
    await user.click(screen.getByRole('button', { name: /Continuer vers la livraison/ }));
    await user.click(screen.getByRole('button', { name: /Continuer vers le paiement/ }));
    await user.click(screen.getByRole('button', { name: /Vérifier la commande/ }));
    await user.click(screen.getByRole('checkbox', { name: /J’ai vérifié/ }));
    await user.click(screen.getByRole('button', { name: /Confirmer la commande COD/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Commande confirmée' })).toBeVisible();
    expect(screen.getByText('DEMO-DZ-1091')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Voir le suivi/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'DEMO-DZ-1091' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Suivi' })).toBeVisible();

    cleanup();
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'DEMO-DZ-1091' })).toBeVisible();
    expect(screen.getByText('5 oct. · 10:30')).toBeVisible();
  });

  it('keeps a deep-linked catalog route usable in Arabic RTL', async () => {
    window.history.replaceState({}, '', '/category/phones');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { level: 1, name: 'هواتف' })).toBeVisible();
    expect(screen.getByRole('button', { name: /عرض المنتج: هاتف 5G/ })).toBeVisible();
  });
});
