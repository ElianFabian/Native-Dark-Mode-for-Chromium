# Native Dark Mode 0.13.2

- Simulated Native keeps track of elements that still need sampling during scrolling. It can revisit those candidates without walking the entire document after each scroll event.
- Full viewport refreshes skip building unused style signatures for image elements. Images still get sampled against their current background.
- The renderer skips additional background artwork reads when the element and its generated layers have no background image.

Download the GitHub release's **Source code (zip)** and extract it. In the browser's Extensions page, turn on **Developer mode**, click **Load unpacked**, and select the extracted `extension` folder.
