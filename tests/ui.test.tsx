// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Button } from '../src/components/ui/button';
import { Login } from '../src/components/login';
it('exposes an accessible, disabled approval control', () => {
  render(<Button disabled>Approve edition</Button>);
  expect(screen.getByRole('button', { name: 'Approve edition' })).toBeDisabled();
  cleanup();
});
it('explains missing auth configuration without pretending the owner logged in', () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  render(<Login message="Configure authentication" />);
  expect(screen.getByRole('heading', { name: 'Sign in to Newsroom' })).toBeVisible();
  expect(screen.getByText(/Server configuration is required/)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Continue with Google/ })).not.toBeInTheDocument();
  cleanup();
  vi.unstubAllEnvs();
});
it('runs an actual button event handler', () => {
  const click = vi.fn();
  render(<Button onClick={click}>Test connection</Button>);
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
  expect(click).toHaveBeenCalledOnce();
  cleanup();
});
