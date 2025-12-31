# Guided Headshot Capture - Testing Guide

## Overview
This document provides a comprehensive testing guide for the guided headshot capture feature.

## Implementation Summary

### Components Created
1. **GuidedHeadshotCapture.tsx** - Main component handling camera stream, countdown, capture, and review
2. **HeadshotManager.tsx** - Updated with mode toggle between "Upload Files" and "Guided Capture"

### Key Features Implemented
- Camera stream access with permission handling
- Sequential capture of 5 images with countdown (3, 2, 1, Click!)
- Pose instructions for each capture:
  1. Turn head all the way to the LEFT
  2. Turn head slightly to the LEFT
  3. Look STRAIGHT at the camera
  4. Turn head slightly to the RIGHT
  5. Turn head all the way to the RIGHT
- Review screen with all captured images
- Upload all or retake functionality
- Automatic pose_bucket assignment based on capture sequence

## Manual Testing Checklist

### 1. Basic Navigation
- [ ] Navigate to Settings page (http://localhost:3001/settings)
- [ ] Verify "Headshots" section is visible
- [ ] Verify mode toggle shows "Upload Files" and "Guided Capture" buttons
- [ ] Click "Guided Capture" button
- [ ] Verify camera preview appears

### 2. Camera Permissions
- [ ] **Grant Permission Test**: Allow camera access when prompted
  - Camera stream should start
  - Video preview should show mirrored image
  - "Start Capture" button should be visible
- [ ] **Deny Permission Test**: Deny camera access when prompted
  - Error message should appear: "Camera permission denied..."
  - "Back to Upload" button should be visible
  - Clicking back should return to upload mode
- [ ] **No Camera Test**: Test on device without camera
  - Error message should appear: "No camera found..."

### 3. Guided Capture Flow
- [ ] Click "Start Capture" button
- [ ] Verify countdown displays: 3, 2, 1, Click!
- [ ] Verify first pose instruction: "Turn your head all the way to the LEFT"
- [ ] After countdown, verify:
  - Flash effect appears briefly
  - Image is captured
  - Thumbnail appears in bottom progress indicator
  - Instruction changes to "Turn your head slightly to the LEFT"
  - Countdown starts again automatically
- [ ] Repeat verification for all 5 poses
- [ ] Verify timing between captures (~2-3 seconds)
- [ ] Verify progress indicator shows X/5 photos

### 4. Review Screen
After all 5 photos captured:
- [ ] Review screen appears automatically
- [ ] All 5 images are displayed in grid
- [ ] Each image has correct label:
  - "Far Left", "Left", "Center", "Right", "Far Right"
- [ ] "Retake All" button is visible
- [ ] "Upload All" button is visible
- [ ] "Cancel" button is visible

### 5. Review Actions
- [ ] **Retake Test**: Click "Retake All"
  - All captured images cleared
  - Camera stream restarts
  - Returns to first pose instruction
  - Progress reset to 0/5
- [ ] **Upload Test**: Click "Upload All"
  - Loading state appears
  - Images upload to Supabase
  - Pose analysis triggered for each
  - Returns to upload mode
  - Uploaded headshots appear in grid
  - Each has correct pose_bucket assigned

### 6. Edge Cases
- [ ] **Cancel during setup**: Click cancel before starting
  - Returns to upload mode
  - Camera stream stops
- [ ] **Cancel during review**: Click cancel on review screen
  - Returns to upload mode
  - Captured images cleaned up
- [ ] **Max headshots reached**: Have 5 headshots already
  - Error appears when clicking "Start Capture"
  - Message: "Cannot capture 5 new headshots..."
- [ ] **Switch modes**: Toggle between upload and guided
  - Camera stream stops when leaving guided mode
  - No memory leaks

### 7. Mobile Testing
Test on mobile devices (iOS Safari, Chrome Android):
- [ ] Camera access works
- [ ] Video preview displays correctly
- [ ] Portrait orientation works
- [ ] Landscape orientation works
- [ ] Touch interactions work (buttons)
- [ ] Countdown and instructions are readable
- [ ] Review grid is responsive

### 8. Browser Compatibility
- [ ] Chrome (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] Safari (iOS)
- [ ] Chrome (Android)

### 9. Performance
- [ ] Camera stream starts within 2 seconds
- [ ] Countdown timing is accurate (1 second per count)
- [ ] Image capture is instant (no lag)
- [ ] Flash effect is smooth
- [ ] Upload completes within reasonable time
- [ ] No memory leaks after multiple captures

### 10. Visual/UX
- [ ] Camera preview is mirrored (feels natural)
- [ ] Instructions are large and readable
- [ ] Countdown numbers are prominent
- [ ] Flash effect is noticeable but not jarring
- [ ] Progress indicator is clear
- [ ] Review grid is well-spaced
- [ ] Buttons have clear hover states
- [ ] Loading states are visible

## Known Limitations
1. **Browser Support**: Requires modern browsers with MediaDevices API support
2. **HTTPS Required**: Camera access requires HTTPS in production (localhost works)
3. **Permission Persistence**: Browser may remember permission choice
4. **Camera Selection**: User selects camera in browser prompt (can't programmatically choose)

## Troubleshooting

### Camera not starting
- Check browser permissions (Settings > Privacy > Camera)
- Ensure HTTPS connection (or localhost)
- Check browser console for errors
- Try refreshing the page

### Images not uploading
- Check Supabase connection
- Verify user is authenticated
- Check storage bucket permissions
- Check network tab for API errors

### Countdown timing off
- Check browser performance
- Close other tabs/applications
- Test on different device

## Code Quality Checklist
- [x] TypeScript types are correct
- [x] No linter errors
- [x] Error handling for camera access
- [x] Error handling for upload failures
- [x] Cleanup of camera stream on unmount
- [x] Cleanup of captured image URLs
- [x] Loading states during upload
- [x] Responsive design
- [x] Accessibility (labels, ARIA)

## Next Steps
1. Test manually following this checklist
2. Fix any issues found
3. Test on multiple devices and browsers
4. Consider adding:
   - Option to select specific camera (front/back)
   - Image quality settings
   - Preview before each capture (pause countdown)
   - Audio feedback on capture
   - Download captured images locally


