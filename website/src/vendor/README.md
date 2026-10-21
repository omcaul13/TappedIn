Vendored, unmodified (source-map comments removed) so the site loads nothing from a third party:

- `gsap.min.js`, `ScrollTrigger.min.js`, `SplitText.min.js`: GSAP 3.13.0 (npm `gsap`), under GreenSock's Standard "no charge" license, https://gsap.com/standard-license
- `lenis.min.js`: Lenis 1.3.11 (npm `lenis`), MIT, see `LICENSE-lenis.txt`

To update: `npm pack gsap@<v> lenis@<v>`, copy the same files from each package's `dist/`.
