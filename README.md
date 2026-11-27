# The Unknown Ratings — V2

This ZIP uses the same three-file website structure as V1:
- `index.html` — page structure
- `styles.css` — visual styles and responsive layout
- `app.js` — rating, meter, navigation, and demo admin logic

## Deploy to GitHub Pages
1. Extract this ZIP.
2. Upload all three files to the root of the `TheUnknown-svg/the-unknown-ratings` repository.
3. Commit the changes to the deployment branch.
4. In GitHub Pages settings, use the repository root (`/`) as the publishing source.

## Important limitations
This is a static frontend prototype. Ratings and settings are stored in each visitor's browser using `localStorage`; they are not shared between visitors. Browser-local duplicate-vote checks are not secure IP-based protections. The admin interface is not protected by server-side authentication. Do not use this build to collect real public votes or sensitive information until a backend with authenticated admin access, server-side validation, rate limiting, and shared storage is connected.
