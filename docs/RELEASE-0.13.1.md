# Native Dark Mode 0.13.1

- Simulated Native skips repeat scroll scans when every eligible element has already been sampled. New content and shadow-root changes invalidate that result.
- Stylesheet rescans account for additional border widths and generated-layer paint, so a stylesheet edit can refresh a border whose element attributes stayed the same.
- Custom themes reuse authored image-backed text ink within a sampling batch.

Native remains the default. In the fixed local scroll benchmark, median browser task time fell from 271 to 142 ms and sampled paint and geometry matched. Frame intervals were similar. [Benchmark and verification details](PERFORMANCE-WEB-RESEARCH.md#verified-empty-collection-in-simulated-native)

The 0.13.1 candidate passed all 14 stages of `npm run verify -- --browser` on Windows with isolated Brave, including 140 Node tests and 375 shared rendering combinations. The verification session is `b4e0e01c-4ab5-4add-9bd0-d68e1aa4c0a3`.

Download the GitHub release's **Source code (zip)** and extract it. In the browser's Extensions page, turn on **Developer mode**, click **Load unpacked**, and select the extracted `extension` folder.
