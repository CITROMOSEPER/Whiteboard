# Third-party notices

The Whiteboard app contains no third-party code. Its handwriting recognition model
(`js/ink-model.js`, also embedded in the built files under `dist/`) was trained by the scripts
in `training/` on the public datasets listed below, together with characters rendered from the
fonts installed on the training machine. The datasets themselves are **not** included in this
project; `training/download.py` fetches them from their original sources.

See `MODEL-LICENSE.md` for the terms that apply to the trained model.

## EMNIST (digits and Latin letters)

- Cohen, G., Afshar, S., Tapson, J., & van Schaik, A. (2017). *EMNIST: an extension of MNIST to
  handwritten letters.* <http://arxiv.org/abs/1702.05373>
- Source: <https://www.nist.gov/itl/products-and-services/emnist-dataset>
- EMNIST is derived from **NIST Special Database 19**. The source of the underlying data is the
  National Institute of Standards and Technology (NIST), U.S. Department of Commerce.
- Licence: the EMNIST page states no licence. NIST's statement on its own data
  (<https://www.nist.gov/open/license>) says that works of NIST employees are generally not subject
  to copyright protection in the United States, may be subject to foreign copyright, are provided
  "as is" without warranty, and asks that NIST be acknowledged as the source.

## HASYv2 (mathematical symbols and Greek letters)

- Thoma, M. (2017). *The HASYv2 dataset.* <https://arxiv.org/abs/1701.08380>
- Source: <https://doi.org/10.5281/zenodo.259444>
- Licence: **Open Database License (ODbL) v1.0** — full text in `licenses/ODbL-1.0.txt`,
  <https://opendatacommons.org/licenses/odbl/1-0/>
- Notice: the handwriting recognition model contains information from HASYv2, which is made
  available under the Open Database License (ODbL).

## CoMNIST (Cyrillic letters)

- CoMNIST by Gregory Vial, <https://github.com/GregVial/CoMNIST>, with images crowd-sourced through
  a web page by Anna Migushina and drawn by the contributors listed in that repository.
- Licence: **Creative Commons Attribution-ShareAlike 4.0 International** — full text in
  `licenses/CC-BY-SA-4.0.txt`, <https://creativecommons.org/licenses/by-sa/4.0/>
- Changes: the images were cropped, resized to 32×32, distorted for variety, and used only as
  training examples; none of them is reproduced in this project.

## Fonts

Additional training examples were rendered from fonts installed with Windows on the training
machine. No font file or glyph outline is included in this project or in the model file.
