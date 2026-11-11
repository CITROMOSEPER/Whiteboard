# Licence of the handwriting recognition model

This applies to the trained model weights only: the file `js/ink-model.js` and the copies of it
embedded in `dist/Whiteboard.html` and `dist/web/index.html`.

Everything else in this project (the app's source code, including the code in `js/ink.js` that
runs the model, and the training scripts in `training/`) is covered by the project's own licence.

## Terms

The model weights are made available under the
**Creative Commons Attribution-ShareAlike 4.0 International** licence (CC BY-SA 4.0).
Full text: `licenses/CC-BY-SA-4.0.txt` or <https://creativecommons.org/licenses/by-sa/4.0/>.

If you redistribute the weights, or weights derived from them, keep this file and
`THIRD-PARTY-NOTICES.md` with them and license them under the same terms.

## Why the weights have their own licence

The weights were produced by training on three public datasets (see `THIRD-PARTY-NOTICES.md`):

- **CoMNIST** is licensed CC BY-SA 4.0, which requires adaptations to carry the same licence.
- **HASYv2** is licensed under the Open Database License (ODbL) 1.0. The model contains
  information from HASYv2, which is made available under the ODbL.
- **EMNIST** is derived from NIST Special Database 19; NIST is acknowledged as the source.

Whether trained weights legally count as an adaptation of the data they were trained on is not
settled. Publishing the weights under CC BY-SA 4.0 with these notices is the cautious reading.
It is not legal advice.

## Building a model without share-alike data

`training/prepare.py` and `training/train.py` can be rerun after removing the HASYv2 and CoMNIST
steps from `prepare.py`. The resulting model would read digits and Latin letters from real
handwriting, and everything else only from font-rendered examples.
