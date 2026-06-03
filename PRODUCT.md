# Ristorg

## Product Purpose
Restaurant staff management and shift optimization tool. Collaborative, real-time, used by restaurant managers and partners to organize staff, schedule shifts, and track worked hours.

## Users
- **Primary**: Restaurant managers / owners (25-55 years old), often on laptop at a desk or tablet at the restaurant. Work under time pressure. Need fast, clear actions.
- **Secondary**: Shift supervisors checking schedules on their phones.

## Brand & Tone
- **Professional but warm**: This is a work tool for the hospitality industry. It should feel organized and efficient, but not corporate or cold.
- **Italian hospitality**: Warm, human, approachable. The restaurant industry is about people.
- **Confidence**: The interface should make managers feel in control of complex scheduling.

## Register
product

## Anti-references
- Generic SaaS dashboards with blue-on-white (too corporate)
- Overly playful/cartoon apps (not serious enough for business)
- Dense spreadsheet-like interfaces (too intimidating)

## Key Surfaces
1. **Area cards** (home): Entry points to staff management areas (kitchen, dining room, custom)
2. **Operator list**: Staff roster with CRUD operations
3. **Shift calendar**: Day/week/month navigation with shift cards showing assignments
4. **Attendance table (Orari)**: Time tracking with editable inputs and hours calculation
5. **Modals**: Create/edit shifts, operators, copy shifts, confirmations

## Constraints
- Vanilla JS, no framework
- CSS custom properties for theming
- Firebase Firestore for real-time sync
- GitHub Pages hosting (static files only)
- Must work on desktop (primary) and tablet/phone (secondary)
