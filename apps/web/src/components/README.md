# Components

This directory contains reusable React components for the Node2AI web dashboard.

## Sidebar Components

### Sidebar

The main sidebar navigation component that provides:

- Collapsible navigation menu
- Mobile-responsive overlay
- Dark/light theme support
- Navigation items with icons and active states

### SidebarProvider

React context provider that manages sidebar state:

- `isOpen`: Current sidebar state
- `toggle()`: Toggle sidebar open/closed
- `open()`: Open sidebar
- `close()`: Close sidebar

### SidebarToggle

Toggle button component for opening/closing the sidebar:

- Shows appropriate chevron icon based on state
- Accessible with proper ARIA labels

## Page Layout

### PageLayout

Reusable layout wrapper that includes:

- Sidebar integration
- Header with title and subtitle
- Optional header actions
- Theme toggle button
- Responsive design

Usage:

```tsx
<PageLayout
  title="Page Title"
  subtitle="Optional subtitle"
  headerActions={<button>Action</button>}
>
  <div>Page content</div>
</PageLayout>
```

## Dropdown Components

### Dropdown

A flexible dropdown component for action menus:

- Custom trigger element
- Configurable dropdown items with icons
- Click outside to close
- Position control (left/right)
- Support for disabled items and custom styling

Usage:

```tsx
<Dropdown
  trigger={<button>Actions</button>}
  items={[
    { label: 'Edit', icon: <PencilIcon />, onClick: () => {} },
    {
      label: 'Delete',
      icon: <TrashIcon />,
      onClick: () => {},
      className: 'text-red-600',
    },
  ]}
/>
```

### SelectDropdown

A select-style dropdown for form inputs:

- Searchable options
- Custom placeholder
- Disabled state support
- Keyboard navigation

Usage:

```tsx
<SelectDropdown
  value={selectedValue}
  onChange={setSelectedValue}
  options={[
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
  ]}
  placeholder="Select an option"
/>
```

## Theme Components

### ThemeToggleButton

Button component for switching between light/dark themes.

### ThemeProvider

Context provider for theme management across the application.
