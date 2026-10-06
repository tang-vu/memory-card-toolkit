# Contributing to Memory Card Toolkit

First off, thank you for considering contributing to Memory Card Toolkit! 🎉

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check the existing issues. When creating a bug report, include:

- **Clear title** describing the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs actual behavior
- **Screenshots** if applicable
- **Environment info** (OS version, app version)

### 💡 Suggesting Features

Feature suggestions are welcome! Please:

- Check if the feature has already been suggested
- Provide a clear description of the feature
- Explain why this feature would be useful
- Consider how it fits with the project scope

### 🔧 Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit with clear messages (`git commit -m 'Add amazing feature'`)
5. Push to your branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/memory-card-toolkit.git
cd memory-card-toolkit

# Install dependencies
npm install

# Start development server
npm run dev
```

### Project Structure

```
memory-card-toolkit/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.js     # App entry point
│   │   ├── preload.js  # Context bridge
│   │   └── diskService.js  # Disk operations
│   └── renderer/       # React UI
│       ├── App.jsx
│       ├── components/
│       ├── data/
│       └── styles/
├── public/             # Static assets
└── package.json
```

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Ensure your code follows the project's style guidelines
3. Update documentation as needed
4. The PR will be merged once approved by a maintainer

### PR Checklist

- [ ] My code follows the project style guidelines
- [ ] I have tested my changes locally
- [ ] I have updated documentation as needed
- [ ] My commits have clear, descriptive messages

## Style Guidelines

### JavaScript/React

- Use ES6+ features
- Prefer functional components with hooks
- Use meaningful variable and function names
- Add comments for complex logic

### CSS

- Follow the Neo Brutalism design system
- Use CSS variables defined in `index.css`
- Keep selectors specific but not overly nested

### Commits

- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Keep the first line under 72 characters

## 🙏 Thank You!

Your contributions make open source amazing. Thank you for being part of this project!

## Renderer checks without device access

```bash
npm ci --ignore-scripts
npm run test:renderer
npm run build:renderer
```

These commands run React DOM tests with synthetic read-only IPC fixtures and build
only the web renderer. They do not launch Electron or package the desktop app.
The tests reject unexpected IPC calls, disk mutations, browser alerts/confirmations and network access.
They cover main-panel detail metadata ownership during selection changes, pending
reads, retries and refreshes. They do not validate disk operations or hardware.

The main panel shows the current selected device's summary while details load or
are unavailable. Use **Retry details** to repeat an unavailable metadata lookup.
