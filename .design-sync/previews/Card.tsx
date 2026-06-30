import React from 'react';
import { Card } from '@athlink/design-system';

export const Default = () => (
  <Card>
    <div style={{ fontWeight: 800, fontSize: 16 }}>Hong Kong Race Week 2026</div>
    <div style={{ color: 'var(--mut)', fontSize: 13, marginTop: 4 }}>29er · 48 entries · Hebe Haven YC</div>
  </Card>
);

export const Hoverable = () => (
  <Card hoverable>
    <div style={{ fontWeight: 800, fontSize: 16 }}>ILCA 6 Nationals</div>
    <div style={{ color: 'var(--mut)', fontSize: 13, marginTop: 4 }}>Tap to open · 62 athletes</div>
  </Card>
);
