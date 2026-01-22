---
name: add-fit-message
description: Add a new FIT message or update an existing one
---

# Add/Update FIT Message

## Prerequisites

- Identify Message ID (e.g., 285 for Jump)
- Identify Field IDs and Types from Garmin SDK

## Steps

1.  **Modify `src/fit.ts`** - Add message definition
2.  **Run `npm run codegen`** - Updates `src/fit_types.ts`
3.  **Add Test** - Create test in `test/`
4.  **Verify** - Run `npm run build && npm run test`

## Example Entry

```typescript
285: {
  name: 'jump',
  253: { field: 'timestamp', type: 'date_time', scale: null, offset: 0, units: 's' },
  0: { field: 'distance', type: 'float32', scale: null, offset: 0, units: 'm' },
  5: { field: 'position_lat', type: 'sint32', scale: null, offset: 0, units: 'semicircles' },
}
```
