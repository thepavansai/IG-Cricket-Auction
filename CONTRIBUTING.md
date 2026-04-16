# Contributing to Cricket Auction Platform

We love your input! We want to make contributing to this project as easy and transparent as possible.

## Development Setup

1. Fork and clone the repo
2. Follow Quick Start in README.md
3. Create a feature branch from `main`

## Pull Request Process

1. Update docs/comments for any new features
2. Test both dark and light modes
3. Ensure no console errors in browser dev tools
4. Include meaningful commit messages
5. Submit PR with description of changes

## Code Style

- **Go**: Follow `gofmt` and Go conventions
- **React**: Use functional components, hooks, no className where inline styles work
- **CSS**: Use CSS variables for theme consistency

## Theme Guidelines

When adding UI:
- Use `var(--text)`, `var(--bg)`, `var(--border)` etc. for colors
- Test contrast in both dark and light modes
- Aim for WCAG AA or better contrast ratios

## Reporting Issues

Use GitHub Issues to report bugs. Include:
- Browser/OS
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

Thank you for contributing! 🏏
