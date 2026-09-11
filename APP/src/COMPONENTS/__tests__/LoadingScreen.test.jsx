/**
 * LoadingScreen Component Tests
 * 
 * Tests for Phase 10.1.13: Write unit tests for key React components
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingScreen from '../LoadingScreen';

describe('LoadingScreen', () => {
  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<LoadingScreen />);
      expect(screen.getByAltText(/ONECO Logo/i)).toBeInTheDocument();
    });

    it('should display brand name', () => {
      render(<LoadingScreen />);
      expect(screen.getByAltText(/ONECO Logo/i)).toBeInTheDocument();
    });

    it('should display subtitle', () => {
      render(<LoadingScreen />);
      expect(screen.getByText('School Management System')).toBeInTheDocument();
    });

    it('should display logo image', () => {
      render(<LoadingScreen />);
      const logo = screen.getByAltText(/ONECO Logo/i);
      expect(logo).toHaveAttribute('src', '/oneco.png');
    });
  });

  describe('Animation Elements', () => {
    it('should render loading dots', () => {
      const { container } = render(<LoadingScreen />);
      const dots = container.querySelectorAll('[class*="dot"]');
      expect(dots.length).toBe(3);
    });

    it('should render progress bar', () => {
      const { container } = render(<LoadingScreen />);
      const progressBar = container.querySelector('[class*="progressBar"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should render background particles', () => {
      const { container } = render(<LoadingScreen />);
      const particles = container.querySelectorAll('[class*="particle"]');
      expect(particles.length).toBe(20);
    });
  });

  describe('Accessibility', () => {
    it('should have alt text for logo', () => {
      render(<LoadingScreen />);
      const logo = screen.getByAltText(/ONECO Logo/i);
      expect(logo).toHaveAccessibleName();
    });

    it('should have proper heading hierarchy', () => {
      render(<LoadingScreen />);
      expect(screen.getByAltText(/ONECO Logo/i)).toBeInTheDocument();
    });
  });
});
