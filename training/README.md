# Training the handwriting recogniser

These scripts produce `js/ink-model.js`, the weights of the small neural network that the app
runs in plain JavaScript (`js/ink.js`). They need Python with TensorFlow, NumPy, Pillow,
fontTools and requests. Nothing here is needed to run the app.

```
python training/download.py     # fetch the public datasets into training/data/ (about 650 MB)
python training/prepare.py      # build one training set: training/work/dataset.npz
python training/train.py        # train, report accuracy, write js/ink-model.js
python build.py                 # rebuild dist/ with the new model
```

- `classes.py` lists the characters the model knows. It must match `SETS` in `js/ink.js`.
- `training/data/` and `training/work/` hold downloaded and intermediate files. They are large,
  are ignored by git, and should not be uploaded with the project.
- The datasets and their licences are listed in `THIRD-PARTY-NOTICES.md`; the licence of the
  resulting model is in `MODEL-LICENSE.md`.
