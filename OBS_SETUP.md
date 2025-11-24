# OBS Browser Source Setup for Shogi Teacher

This guide explains how to use the Shogi Teacher app as a browser source in OBS for streaming.

## Features

- **Real-time game sync**: Updates automatically as moves are made in the main app
- **Transparent background**: Integrates cleanly with your stream layout
- **Simplified UI**: Shows only the board and essential move information
- **1920x1080 resolution**: Optimized for full HD streaming
- **Board customization**: Uses the same visual settings (notation, coordinates, etc.) from your main app

## Setup Instructions

### 1. Start the Shogi Teacher App

Run the app as normal using:
```bash
cd frontend
npm run electron:dev
```

### 2. Access the OBS View

- Click the **Monitor icon** in the sidebar (below the sound toggle) to preview the OBS view
- Or navigate directly to: `http://localhost:3000/obs`

### 3. Add to OBS

1. In OBS, add a new **Browser** source
2. Set the following properties:
   - **URL**: `http://localhost:3000/obs`
   - **Width**: `1920`
   - **Height**: `1080`
   - **FPS**: `30` (or higher for smoother updates)
   - ✅ Enable: **Shutdown source when not visible**
   - ✅ Enable: **Refresh browser when scene becomes active**

### 4. Customize in OBS

- **Position & Scale**: Resize and position the source to fit your layout
- **Chroma Key**: Not needed (transparent background)
- **Crop**: Use filters to crop specific areas if desired

## What's Displayed

### Left Panel (200px wide):
- **Current turn**: Which player (Black/White) is to move
- **Move count**: Total number of moves made
- **Move history**: Scrollable list of all moves in algebraic notation

### Main Area:
- **Shogi board**: Full game board with pieces
- **Visual settings sync**: Matches your main app settings:
  - Japanese/Western notation
  - Coordinate display
  - Board flip
  - Last move highlighting

## Tips

- **Board settings**: Change board appearance in the main app's board options panel - the OBS view will sync automatically
- **Real-time updates**: The view polls every 500ms, so moves appear almost instantly
- **Multiple scenes**: You can add the same source to multiple OBS scenes
- **Performance**: The OBS view is lightweight and shouldn't impact stream performance

## Troubleshooting

**Board not updating?**
- Ensure the main app is running
- Check that you're using the correct URL (`http://localhost:3000/obs`)
- Try refreshing the browser source in OBS

**Wrong session showing?**
- The OBS view always shows the most recent active game session
- Start a new game in the main app to reset

**Layout issues?**
- The view is designed for 1920x1080
- Use OBS transform tools to fit it to your stream layout
- Consider using OBS Studio's built-in scaling and cropping

## Advanced Customization

If you want to modify the OBS view appearance:
- Edit: `frontend/app/obs/page.tsx` (main layout)
- Edit: `frontend/components/OBSMoveHistory.tsx` (move panel)

Adjust the panel width by changing the `w-[200px]` class in `OBSMoveHistory.tsx`.
