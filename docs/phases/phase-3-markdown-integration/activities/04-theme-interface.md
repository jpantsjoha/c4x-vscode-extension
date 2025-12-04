# Activity 4: Theme Interface and Type System

**Task Reference**: PHASE-3-TASK-BREAKDOWN.md → Category 2, Task 2.1
**Estimated Time**: 30 minutes
**Priority**: Critical Path
**Status**: 🔴 NOT STARTED

---

## 📋 Overview

Define TypeScript interfaces and types for the C4X theme system. This foundational work enables all 5 themes (Classic, Modern, Muted, High-Contrast, Auto) to share a consistent structure while allowing customization of colors, styles, and rendering options.

**Goal**: Create a type-safe theme system that supports multiple visual styles and seamless theme switching.

---

## 🎯 Prerequisites

**Code Dependencies**:
- [ ] Phase 2 SVG renderer complete
- [ ] Understanding of SVG styling (fill, stroke, text colors)

**Knowledge Requirements**:
- TypeScript interfaces and types
- C4 Model element types (Person, Software System, Container, Component)
- Color theory basics (hex colors, contrast ratios)

---

## ✅ Acceptance Criteria

### Functional Requirements
- [ ] `C4Theme` interface defined with all required fields
- [ ] Element color interfaces defined (fill, stroke, text)
- [ ] Relationship color interfaces defined
- [ ] Style options interface defined (border radius, width, fonts)
- [ ] Theme name type defined with all 5 theme names
- [ ] All interfaces exported and documented with JSDoc

### Quality Requirements
- [ ] TypeScript strict mode compatibility
- [ ] No compilation errors
- [ ] JSDoc comments for all public interfaces
- [ ] Type safety for theme consumers

---

## 🔨 Implementation

### Step 1: Create Theme Interface File

**File**: `src/themes/Theme.ts`

```typescript
/**
 * Color configuration for a C4 element type.
 * Defines fill, stroke, and text colors for rendering.
 */
export interface C4ElementColors {
  /**
   * Background/fill color (hex format: #RRGGBB)
   * @example "#08427B" (C4 Model blue for Person)
   */
  fill: string;

  /**
   * Border/stroke color (hex format: #RRGGBB)
   * @example "#000000" (black border)
   */
  stroke: string;

  /**
   * Text color for labels (hex format: #RRGGBB)
   * @example "#FFFFFF" (white text)
   */
  text: string;
}

/**
 * Color configuration for relationships/arrows.
 */
export interface C4RelationshipColors {
  /**
   * Arrow line color (hex format: #RRGGBB)
   */
  stroke: string;

  /**
   * Relationship label text color (hex format: #RRGGBB)
   */
  text: string;
}

/**
 * Visual style configuration for theme rendering.
 */
export interface C4ThemeStyles {
  /**
   * Border radius in pixels (0 = square corners, 10+ = rounded)
   * @example 0 (Classic theme - square corners)
   * @example 12 (Modern theme - rounded corners)
   */
  borderRadius: number;

  /**
   * Border width in pixels (1-4 typical range)
   * @example 2 (standard border)
   * @example 3 (high-contrast theme - thicker border)
   */
  borderWidth: number;

  /**
   * Font size in pixels for element labels
   * @example 14 (standard size)
   * @example 16 (high-contrast theme - larger for accessibility)
   */
  fontSize: number;

  /**
   * Font family for all text
   * @example "Arial, sans-serif"
   * @example "Inter, Helvetica, sans-serif"
   */
  fontFamily: string;

  /**
   * Whether to render drop shadows on elements
   * @example false (Classic, Muted themes)
   * @example true (Modern theme)
   */
  shadowEnabled: boolean;
}

/**
 * Complete theme definition for C4 diagrams.
 * Includes colors for all element types and visual styling options.
 */
export interface C4Theme {
  /**
   * Internal theme identifier (lowercase, no spaces)
   * @example "classic", "modern", "high-contrast"
   */
  name: string;

  /**
   * Display name shown in theme picker UI
   * @example "Classic", "Modern", "High Contrast"
   */
  displayName: string;

  /**
   * Brief description of theme purpose/style
   * @example "Official C4 Model colors (Simon Brown)"
   * @example "WCAG AAA compliant (accessible)"
   */
  description: string;

  /**
   * Color palette for all C4 element types
   */
  colors: {
    /**
     * Colors for Person elements (actors, users)
     */
    person: C4ElementColors;

    /**
     * Colors for Software System elements
     */
    softwareSystem: C4ElementColors;

    /**
     * Colors for External System elements (outside scope)
     */
    externalSystem: C4ElementColors;

    /**
     * Colors for Container elements (applications, services, databases)
     */
    container: C4ElementColors;

    /**
     * Colors for Component elements (code-level components)
     */
    component: C4ElementColors;

    /**
     * Colors for relationships/arrows
     */
    relationship: C4RelationshipColors;

    /**
     * Background color for diagram canvas (hex format: #RRGGBB)
     * @example "#FFFFFF" (white background)
     * @example "#1E1E1E" (dark background for dark themes)
     */
    background: string;
  };

  /**
   * Visual styling options
   */
  styles: C4ThemeStyles;
}

/**
 * Supported theme names.
 * Used for type-safe theme selection.
 */
export type ThemeName = 'classic' | 'modern' | 'muted' | 'high-contrast' | 'auto';

/**
 * Theme registry type for storing all available themes.
 */
export type ThemeRegistry = Record<ThemeName, C4Theme>;
```

---

### Step 2: Create Theme Utility Types

**File**: `src/themes/ThemeUtils.ts`

```typescript
import { C4ElementColors, C4Theme } from './Theme';
import { C4ElementType } from '../model/C4Model';

/**
 * Get element colors from theme based on element type and tags.
 *
 * @param theme - The current theme
 * @param elementType - C4 element type
 * @param tags - Optional element tags (e.g., ["External"])
 * @returns Color configuration for the element
 */
export function getElementColors(
  theme: C4Theme,
  elementType: C4ElementType,
  tags?: string[]
): C4ElementColors {
  // Check for "External" tag first
  if (tags?.includes('External') || tags?.includes('external')) {
    return theme.colors.externalSystem;
  }

  // Map element type to theme colors
  switch (elementType) {
    case 'Person':
      return theme.colors.person;
    case 'SoftwareSystem':
      return theme.colors.softwareSystem;
    case 'Container':
      return theme.colors.container;
    case 'Component':
      return theme.colors.component;
    default:
      return theme.colors.softwareSystem; // Fallback
  }
}

/**
 * Validate theme color contrast ratios for accessibility.
 * Returns true if theme meets WCAG AA standards (4.5:1 for normal text).
 *
 * @param theme - Theme to validate
 * @returns True if theme meets accessibility standards
 */
export function validateThemeContrast(theme: C4Theme): boolean {
  // Simplified validation - check that text/background contrast exists
  // Full implementation would calculate actual contrast ratios
  const elements = [
    theme.colors.person,
    theme.colors.softwareSystem,
    theme.colors.container,
    theme.colors.component,
  ];

  for (const element of elements) {
    // Check text is different from fill
    if (element.text === element.fill) {
      return false;
    }
  }

  return true;
}
```

---

### Step 3: Create Theme Manager Skeleton

**File**: `src/themes/ThemeManager.ts`

```typescript
import { C4Theme, ThemeName, ThemeRegistry } from './Theme';

/**
 * Manages theme selection and switching.
 * Singleton pattern - only one theme active at a time.
 */
export class ThemeManager {
  private static currentTheme: C4Theme;
  private static themes: ThemeRegistry;

  /**
   * Initialize theme manager with default theme (Classic).
   */
  public static initialize(themes: ThemeRegistry): void {
    ThemeManager.themes = themes;
    ThemeManager.currentTheme = themes.classic;
  }

  /**
   * Get the currently active theme.
   */
  public static getCurrentTheme(): C4Theme {
    return ThemeManager.currentTheme;
  }

  /**
   * Set the active theme by name.
   * Triggers preview refresh if theme changes.
   */
  public static async setCurrentTheme(themeName: ThemeName): Promise<void> {
    const newTheme = ThemeManager.themes[themeName];
    if (!newTheme) {
      throw new Error(`Unknown theme: ${themeName}`);
    }

    ThemeManager.currentTheme = newTheme;

    // TODO: Trigger preview refresh
    // PreviewPanel.refresh();
  }

  /**
   * Get all available themes.
   */
  public static getAllThemes(): C4Theme[] {
    return Object.values(ThemeManager.themes);
  }

  /**
   * Get theme by name.
   */
  public static getTheme(themeName: ThemeName): C4Theme {
    const theme = ThemeManager.themes[themeName];
    if (!theme) {
      throw new Error(`Unknown theme: ${themeName}`);
    }
    return theme;
  }
}
```

---

## 🧪 Testing

### Unit Tests

**File**: `test/suite/themes/theme.test.ts`

```typescript
import * as assert from 'assert';
import { C4Theme, C4ElementColors } from '../../../src/themes/Theme';
import { getElementColors, validateThemeContrast } from '../../../src/themes/ThemeUtils';

suite('Theme Type System', () => {
  test('C4Theme interface has all required fields', () => {
    const mockTheme: C4Theme = {
      name: 'test',
      displayName: 'Test Theme',
      description: 'Test',
      colors: {
        person: { fill: '#000', stroke: '#000', text: '#FFF' },
        softwareSystem: { fill: '#000', stroke: '#000', text: '#FFF' },
        externalSystem: { fill: '#000', stroke: '#000', text: '#FFF' },
        container: { fill: '#000', stroke: '#000', text: '#FFF' },
        component: { fill: '#000', stroke: '#000', text: '#FFF' },
        relationship: { stroke: '#000', text: '#000' },
        background: '#FFF',
      },
      styles: {
        borderRadius: 0,
        borderWidth: 2,
        fontSize: 14,
        fontFamily: 'Arial',
        shadowEnabled: false,
      },
    };

    assert.ok(mockTheme);
    assert.strictEqual(mockTheme.name, 'test');
  });

  test('getElementColors returns correct colors for element type', () => {
    const mockTheme: C4Theme = {
      /* ... */
      colors: {
        person: { fill: '#PERSON', stroke: '#000', text: '#FFF' },
        softwareSystem: { fill: '#SYSTEM', stroke: '#000', text: '#FFF' },
        /* ... */
      },
      /* ... */
    };

    const personColors = getElementColors(mockTheme, 'Person');
    assert.strictEqual(personColors.fill, '#PERSON');

    const systemColors = getElementColors(mockTheme, 'SoftwareSystem');
    assert.strictEqual(systemColors.fill, '#SYSTEM');
  });

  test('getElementColors returns externalSystem for External tag', () => {
    const mockTheme: C4Theme = {
      /* ... */
      colors: {
        externalSystem: { fill: '#EXTERNAL', stroke: '#000', text: '#FFF' },
        softwareSystem: { fill: '#SYSTEM', stroke: '#000', text: '#FFF' },
        /* ... */
      },
      /* ... */
    };

    const externalColors = getElementColors(mockTheme, 'SoftwareSystem', ['External']);
    assert.strictEqual(externalColors.fill, '#EXTERNAL');
  });
});
```

---

## 📊 Success Metrics

**Code Quality**:
- [ ] All interfaces compile without errors
- [ ] JSDoc comments complete and accurate
- [ ] Type safety enforced (no `any` types)

**Functionality**:
- [ ] ThemeManager initializes correctly
- [ ] getElementColors returns correct colors
- [ ] Theme validation works

---

## 🔗 Related Activities

**Next Activities**:
- Activity 05: Classic Theme Implementation
- Activity 06: Modern Theme Implementation
- Activity 10: Theme Switcher Command

**Dependencies**:
- Phase 2: SVG Renderer (`src/render/SvgBuilder.ts`)
- Phase 2: C4 Model Types (`src/model/C4Model.ts`)

---

## 📝 Next Steps

After completing this activity:
1. Implement Classic theme (Activity 05)
2. Implement remaining 4 themes (Activities 06-09)
3. Integrate themes with SVG renderer
4. Test theme switching performance (< 100ms target)

---

**Activity Owner**: Documentation Agent (DOCA)
**Status**: 🔴 NOT STARTED
**Last Updated**: October 19, 2025
