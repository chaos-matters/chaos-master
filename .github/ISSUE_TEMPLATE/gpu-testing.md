---
name: WebGPU Testing & Error Reporting
about: For WebGPU-related issues, testing, and infrastructure improvements
title: '[GPU] '
labels: bug, investigation, testing
---

## Description
Describe the WebGPU-related issue, error, or testing requirement.

## Reproduction Steps
1. 
2. 
3. 

## Expected Behavior
What should happen?

## Actual Behavior
What actually happens? Include any error messages.

## Environment
- Browser: [e.g., Chrome 124, Firefox 122]
- OS: [e.g., Linux, macOS, Windows]
- Hardware: [e.g., NVIDIA RTX 4090, Integrated GPU]

## Error Message/Console Output
```
(Paste error messages and console output here)
```

## GPU Status Check
Run in browser console:
```javascript
if ('gpu' in navigator) {
  const adapter = await navigator.gpu.requestAdapter()
  console.log('GPU Adapter:', adapter?.info)
} else {
  console.log('WebGPU not supported')
}
```

## Related Issues
- [Issue #xxx]
- [PR #xxx]

## Additional Context
Any additional information about the issue or testing approach.