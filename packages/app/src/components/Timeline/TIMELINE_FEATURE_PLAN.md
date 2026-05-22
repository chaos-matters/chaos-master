# Timeline Editor Feature Plan

## Overview

Transform the timeline editor into a comprehensive animation tool for flame fractals with rich keyframe support, playback controls, and professional-grade features.

## Current State

- Basic timeline structure with FPS, Start/End Frame, and Loop controls
- Collapsible UI section
- Keyframe editor component (basic structure)
- Timeline ruler and panel components
- Cross-browser CSS fixes applied

## Phase 1: Keyframe Parameters and Capabilities

### 1.1 Expand Keyframe Parameters

**Status**: In Progress

#### Camera Parameters

- [x] Camera X Position (keyframes)
- [x] Camera Y Position (keyframes)
- [x] Camera Zoom (keyframes)
- [x] Camera Rotation (keyframes)

#### Render Settings

- [x] Exposure (keyframes)
- [x] Vibrancy (keyframes)
- [x] Skip Iterations (keyframes)
- [x] Palette Phase (keyframes: 0-1 cycling)
- [x] Palette Speed (keyframes: 0-10)
- [ ] Adaptive Filter (toggle with keyframes)
- [x] Background Color RGB (keyframes: [r, g, b])
- [x] Edge Fade Color RGB (keyframes: [r, g, b, a])

#### Flame Transform Parameters

- [ ] All 26 flame variation parameters (waveX, waveY, intensity, etc.)
- [ ] Variation weights and ratios
- [ ] Color palette cycling/phase (time-based)

#### Animation Presets

- [ ] Create animation presets (camera pans, zooms, rotations)
- [ ] Save/load presets
- [ ] Apply preset to current timeline

### 1.2 Advanced Keyframe Features

- [ ] Keyframe interpolation modes: Linear, Ease-In, Ease-Out, Bounce, Elastic
- [ ] Keyframe overlap handling (auto-split at intersections)
- [ ] Keyframe deletion with confirmation
- [ ] Keyframe duplicate functionality
- [ ] Keyframe freeze (hold current value at frame)
- [ ] Keyframe mirror (copy from opposite side)

### 1.3 Bezier and Spline Support

- [ ] Custom Bezier control points for smooth animations
- [ ] Preview control points during edit
- [ ] Visual feedback on curve tension
- [ ] Preset curve shapes (easeInOut, easeInOutQuad, etc.)

## Phase 2: Animation Controls and Playback

### 2.1 Playback Controls

**Status**: Basic controls in place, needs enhancement

- [x] Play/Pause button with visual feedback
- [x] Play all at once or per track
- [x] Stop at end frame
- [x] Pause at specific frame
- [x] Loop toggle (per track and global)
- [x] Frame-by-frame navigation (buttons)
- [ ] Skip to next/previous keyframe
- [ ] Go to frame N input field with validation

### 2.2 Time Controls

- [ ] Play speed control (slow, normal, fast, fastest)
- [ ] Time scale slider for real-time preview
- [ ] Scrubbing along timeline
- [ ] Visible frame counter
- [ ] Total duration display
- [ ] Current time in seconds (based on FPS)

### 2.3 Preview Window

- [ ] Real-time preview canvas
- [ ] One-click preview (show all keyframes in sequence)
- [ ] Preview settings (resolution, quality, render speed)
- [ ] Export preview as GIF/WebM
- [ ] Preview length limiter (preview first N frames)
- [ ] Preview GPU acceleration toggle

### 2.4 Export Features

- [ ] Export animation as video (WebM, MP4, GIF)
- [ ] Export as FLAM3 file sequence
- [ ] Batch export multiple animations
- [ ] Export settings (resolution, frame rate, quality)
- [ ] Export progress indicator
- [ ] Export cancellation support
- [ ] Exported file naming and organization

## Phase 3: UI/UX Improvements

### 3.1 Layout and Navigation

- [ ] Collapsible/expandable timeline controls
- [ ] Horizontal scrolling with smooth performance
- [ ] Pin/Unpin tracks
- [ ] Track grouping (camera, render, variations)
- [ ] Drag-and-drop track reordering
- [ ] Dockable/floating preview window
- [ ] Keyboard shortcuts reference modal

### 3.2 Visual Design

- [ ] Dark mode optimizations for timeline
- [ ] Custom color schemes for keyframes
- [ ] Active/inactive track highlighting
- [ ] Keyframe value indicators
- [ ] Timeline ruler ticks and labels
- [ ] Gradient backgrounds for smooth transitions
- [ ] Progress bar for current frame

### 3.3 Responsive Design

- [ ] Tablet layout optimizations
- [ ] Touch gesture support for timeline (pinch, swipe)
- [ ] Mobile hamburger menu for timeline options
- [ ] Split-screen on large displays
- [ ] Collapsible sidebar for variations

### 3.4 Accessibility

- [ ] Screen reader support for keyframe controls
- [ ] High contrast mode
- [ ] Keyboard navigation (Tab, Arrow keys, Enter)
- [ ] Focus indicators for interactive elements
- [ ] ARIA labels for all controls

## Phase 4: Performance Optimizations

### 4.1 Rendering Performance

- [ ] GPU-accelerated timeline rendering
- [ ] Lazy load of track data
- [ ] Prefetch next/previous frames
- [ ] Off-main-thread preview rendering
- [ ] Web Worker for timeline calculations
- [ ] Memory-efficient storage of keyframes
- [ ] Progressive rendering (low-res first, then high-res)

### 4.2 Animation Performance

- [ ] Preview optimization (adaptive resolution)
- [ ] Frame skipping for fast-forward playback
- [ ] Timeline state caching
- [ ] Efficient interpolation calculations
- [ ] Batch updates to reduce re-renders
- [ ] Debounced UI updates

### 4.3 Resource Management

- [ ] Automatic garbage collection of unused keyframes
- [ ] Memory limit warnings
- [ ] Purge unused tracks
- [ ] Compressed keyframe storage
- [ ] Background cleanup tasks

## Phase 5: Testing Strategy

### 5.1 Unit Tests

- [ ] Keyframe interpolation functions
- [ ] Timeline state management
- [ ] Easing function calculations
- [ ] Animation timing logic
- [ ] UI component renders
- [ ] Drag-and-drop functionality

### 5.2 Integration Tests

- [ ] Create/update/delete keyframes flow
- [ ] Playback controls integration
- [ ] Export workflow
- [ ] Preset save/load
- [ ] Cross-track animations
- [ ] Timeline context integration

### 5.3 E2E Tests

- [ ] Full animation creation workflow
- [ ] Play/pause/stop navigation
- [ ] Frame scrubbing
- [ ] Export to video
- [ ] Preset application
- [ ] Responsive behavior

### 5.4 Performance Tests

- [ ] Keyframe count performance (100+, 1000+ keyframes)
- [ ] Playback smoothness at different speeds
- [ ] Memory usage over time
- [ ] Rendering time per frame
- [ ] GPU memory usage

## Phase 6: Documentation and Help

### 6.1 User Documentation

- [ ] Getting started guide
- [ ] Tutorial videos/gifs
- [ ] Feature reference (all parameters)
- [ ] Best practices guide
- [ ] Troubleshooting section
- [ ] FAQ

### 6.2 In-App Help

- [ ] Tooltips for all controls
- [ ] Quick start popup on first use
- [ ] Sample animations with code
- [ ] Video previews in help
- [ ] Contextual help on selection

### 6.3 API Documentation

- [ ] Timeline API reference
- [ ] Keyframe API methods
- [ ] Event system documentation
- [ ] Extension points for custom plugins

## Phase 7: Advanced Features (Optional)

### 7.1 Timeline Compositing

- [ ] Multiple animation layers
- [ ] Layer blending modes
- [ ] Layer masks
- [ ] Non-linear editing (cut, splice, trim)

### 7.2 Collaboration

- [ ] Import/export timeline JSON
- [ ] Share timeline links
- [ ] Real-time collaboration (future)
- [ ] Version history with rollback

### 7.3 Machine Learning

- [ ] Auto-suggest keyframe positions
- [ ] Predict smooth transitions
- [ ] Animate based on rough sketch
- [ ] Style transfer animations

## Implementation Priority

### High Priority (Phase 1)

1. Camera X/Y Position keyframes
2. Camera Zoom keyframes
3. Exposure keyframes
4. Vibrancy keyframes
5. Keyframe interpolation modes
6. Keyframe deletion
7. Play/Pause controls
8. Frame-by-frame navigation

### Medium Priority (Phase 2)

1. All 26 variation parameters
2. Background color keyframes
3. Speed controls
4. Export to video
5. Scrubbing
6. Track grouping
7. Keyboard shortcuts

### Low Priority (Phase 3-7)

1. UI/UX improvements
2. Performance optimizations
3. Documentation
4. Advanced features
5. Collaboration features

## Success Metrics

- [ ] At least 20 keyframe parameters supported
- [ ] > 95% frame accuracy in playback
- [ ] Smooth playback at 60fps
- [ ] <100ms lag on scrubbing
- [ ] <500ms preview generation
- [ ] Memory usage <200MB for 1000 keyframes
- [ ] User satisfaction score >4/5

## Timeline Estimate

- **Phase 1**: 2-3 weeks
- **Phase 2**: 2 weeks
- **Phase 3**: 2-3 weeks
- **Phase 4**: 1-2 weeks
- **Phase 5**: 1-2 weeks
- **Phase 6**: 1 week
- **Phase 7**: Optional, as needed

**Total**: ~10-14 weeks for full implementation

## Breaking Changes to Consider

- Export format changes (need migration path)
- Data model changes (need schema versioning)
- UI layout changes (update documentation)
- New keyboard shortcuts (consider conflicts)
- Performance trade-offs (document impact)
