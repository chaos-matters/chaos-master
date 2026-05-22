# Timeline Animation System

## Overview

The timeline animation system allows you to create animations of your IFS flames by keyframing various parameters over time. This system enables smooth transitions between different flame settings, creating dynamic and visually interesting animations.

## Features

- **Multiple Keyframeable Parameters**:
  - Camera position (x, y)
  - Camera zoom
  - Exposure (light intensity)
  - Skip iterations (render quality)
  - Vibrancy (color saturation)
  - Draw mode (light/paint)
  - Color initialization mode
  - Point initialization mode
  - Background color (RGB triple)

- **Easing Curves**:
  - Linear (constant speed)
  - Ease In (starts slow, accelerates)
  - Ease Out (starts fast, decelerates)
  - Ease In/Out (starts slow, accelerates, then decelerates)
  - Constant (no easing)

- **Timeline Controls**:
  - Playback control (play/pause/stop)
  - Frame navigation (previous/next/seek)
  - Timeline ruler with keyframe markers
  - FPS configuration (1-60)
  - Loop toggle

## Keyframe Editor

The Keyframe Editor panel lets you create and modify keyframes for any parameter:

### Adding a Keyframe

1. Select the parameter you want to animate in the "Parameter" dropdown
2. Navigate to the specific frame where you want to set a keyframe
3. Enter the parameter value
4. Click "Add Keyframe" (or "Update" if a keyframe already exists at that frame)

### Keyframe Value Types

- **Number Values** (exposure, skipIters, vibrancy): Enter a decimal number
- **String Values** (drawMode, colorInitMode, pointInitMode): Select from dropdown options
- **Array Values** (backgroundColor): Enter as "r, g, b" (e.g., "0, 0, 0" for black)

### Removing Keyframes

To remove a keyframe at the current frame:

1. Ensure you're on the frame with the keyframe
2. Click the "Remove" button

## Using Easing Curves

Easing curves determine how the animation transitions between keyframes:

- **Linear**: Smooth, constant speed
- **Ease In**: Starts slowly, accelerates toward the next keyframe
- **Ease Out**: Starts quickly, decelerates toward the next keyframe
- **Ease In/Out**: Smooth acceleration and deceleration
- **Constant**: No transition (instant jump)

To use an easing curve, when creating a keyframe, select the desired curve from the easing dropdown (if available in your UI implementation).

## Timeline Settings

### Configuration Options

- **FPS**: Frames per second for animation playback (1-60)
- **Start Frame**: First frame of the timeline (0+)
- **End Frame**: Last frame of the timeline
- **Loop**: Toggle to automatically loop the animation when reaching the end

### Frame Navigation

- **Current Frame**: Displayed in the timeline ruler
- **Previous/Next**: Move one frame backward/forward
- **Jump**: Use the frame number input to navigate to a specific frame

## Example Animations

### Camera Zoom In

1. Set Start Frame to 0, End Frame to 60
2. Navigate to frame 0, set keyframe:
   - Parameter: `camera.zoom`
   - Value: 1.0
3. Navigate to frame 60, set keyframe:
   - Parameter: `camera.zoom`
   - Value: 2.5
4. Enable Play to see the zoom effect

### Exponential Glow Effect

1. Set Start Frame to 0, End Frame to 30
2. Navigate to frame 0, set keyframe:
   - Parameter: `exposure`
   - Value: 0.1
3. Navigate to frame 15, set keyframe:
   - Parameter: `exposure`
   - Value: 1.5
   - Easing: Ease In/Out
4. Navigate to frame 30, set keyframe:
   - Parameter: `exposure`
   - Value: 0.1
   - Easing: Ease Out
5. Enable Loop for a pulsing glow effect

### Color Fade Transition

1. Set Start Frame to 0, End Frame to 50
2. Navigate to frame 0, set keyframe:
   - Parameter: `backgroundColor`
   - Value: "0, 0, 0" (black)
3. Navigate to frame 25, set keyframe:
   - Parameter: `backgroundColor`
   - Value: "1, 0, 0" (red)
4. Navigate to frame 50, set keyframe:
   - Parameter: `backgroundColor`
   - Value: "0, 0, 0" (black)
5. Enable Loop for a red flash effect

### Mode Transition

1. Set Start Frame to 0, End Frame to 60
2. Navigate to frame 0, set keyframe:
   - Parameter: `drawMode`
   - Value: "light"
3. Navigate to frame 30, set keyframe:
   - Parameter: `drawMode`
   - Value: "paint"
4. Navigate to frame 60, set keyframe:
   - Parameter: `drawMode`
   - Value: "light"
5. Enable Loop for a light-to-paint transition effect

## Technical Details

### Keyframe Structure

```typescript
{
  frame: number,        // Frame number (0 to endFrame)
  value: number | string | [number, number, number],  // Parameter value
  easing?: EasingCurve // Optional easing curve
}
```

### Timeline Track Structure

```typescript
{
  parameterPath: string,  // Parameter identifier (e.g., "camera.x", "exposure")
  keyframes: KeyframeData[]  // Array of keyframes for this parameter
}
```

### Supported Parameter Paths

- `camera.x` - Camera X position
- `camera.y` - Camera Y position
- `camera.zoom` - Camera zoom level
- `exposure` - Light exposure (0.25 default)
- `skipIters` - Number of iterations (20 default)
- `vibrancy` - Color vibrancy (0.5 default)
- `drawMode` - Light or paint mode
- `colorInitMode` - Color initialization method
- `pointInitMode` - Point initialization method
- `backgroundColor` - Background RGB color

## Performance Considerations

- **Rendering Quality**: Higher `skipIters` values produce better quality but slower rendering
- **Animation Complexity**: More keyframes and higher FPS rates increase computational load
- **WebGPU**: The animation system leverages WebGPU for efficient real-time rendering

## Troubleshooting

### Keyframes Not Working

- Verify you've added at least 2 keyframes for the parameter
- Check that the current frame is between your keyframes
- Ensure the parameter path is correct (case-sensitive)

### Animation Stuttering

- Reduce FPS to 30 or lower
- Decrease `skipIters` value
- Close other heavy applications to free up GPU resources

### Color Not Updating

- Ensure background color is explicitly set (not using auto mode)
- Check that the value format is correct (r, g, b with commas)

## Future Enhancements

Potential features for future development:

- Visual curve editor for easing curves
- Multi-track selection and editing
- Copy/paste keyframes between parameters
- Parameter interpolation presets
- Export animation to video
- Keyframe overdubbing
- Compose multiple animations
