# Remove "Linked account" row from lot details

## Change
In the lot details popup on the Lots section of the dashboard, remove the "Linked account" row (the line that reads Yes / Not linked yet).

## Details
- File: `src/routes/dashboard.tsx`, LotsSection detail dialog (around line 366-369).
- Delete the fourth entry from the details array, leaving Owner, Email, and Occupancy.
- No other pages or logic are affected; the underlying linking behaviour (owners signing up and matching to their lot) stays exactly as is.

## Verification
- Open the dashboard, open a lot's details, confirm only Owner, Email and Occupancy show.
- Confirm no console errors.
