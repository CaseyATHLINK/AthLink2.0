import React from 'react';
import { ThemeRoot, PageHeader, Card, ClassBadge, Button } from '@athlink/design-system';

// ThemeRoot establishes the `.al-ds` design surface (tokens + app background).
// Every AthLink screen is wrapped in it; component styles only apply inside it.
export const AppSurface = () => (
  <ThemeRoot style={{ minHeight: 'auto', padding: 24, borderRadius: 16 }}>
    <PageHeader title="29er Class" sub="Hong Kong fleet · Spring Series 2026" />
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ClassBadge>29er</ClassBadge>
        <span style={{ fontWeight: 700, flex: 1 }}>Race 4 · Hebe Haven YC</span>
        <Button variant="sky">View results</Button>
      </div>
    </Card>
  </ThemeRoot>
);
