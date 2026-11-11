"""Train the handwriting recogniser and write it into the app as js/ink-model.js.

Run:  python training/train.py [epochs]      (after prepare.py)

The network is deliberately small (three convolution layers and two dense layers, about
400 000 weights) so that the app can run it in plain JavaScript in a few milliseconds.
Weights are stored as 8-bit integers. No machine-learning library is needed in the app.
"""
import base64
import json
import os
import sys
from collections import Counter
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
import numpy as np
import tensorflow as tf

from classes import JUNK, LABELS

HERE = Path(__file__).parent
WORK = HERE / "work"
EPOCHS = int(sys.argv[1]) if len(sys.argv) > 1 else 14
BATCH = 384
tf.keras.utils.set_random_seed(7)

data = np.load(WORK / "dataset.npz")
x, y, src = data["x"], data["y"].astype(np.int32), data["src"]
is_test = np.char.endswith(src, "-test")
xt, yt, st = x[is_test], y[is_test], src[is_test]
x, y = x[~is_test], y[~is_test]
C = len(LABELS)
print(f"train {len(y)}  validation {len(yt)}  classes {C}", flush=True)

# Rare classes count a little more, common ones a little less.
freq = np.bincount(y, minlength=C).astype(np.float32)
class_w = np.clip((np.median(freq[freq > 0]) / np.maximum(freq, 1)) ** 0.5, 0.5, 2.0)


def vary(img, label):
    """Per batch: thicker or thinner strokes, so the stroke weight of a dataset is not what gets learned."""
    img = tf.cast(img, tf.float32)[..., None] / 255.0
    r = tf.random.uniform([])
    img = tf.cond(r < 0.25, lambda: tf.nn.max_pool2d(img, 2, 1, "SAME"),
                  lambda: tf.cond(r < 0.40, lambda: tf.nn.max_pool2d(img, 3, 1, "SAME"),
                                  lambda: tf.cond(r < 0.55, lambda: -tf.nn.max_pool2d(-img, 2, 1, "SAME"), lambda: img)))
    img = tf.roll(img, tf.random.uniform([2], -2, 3, tf.int32), axis=[1, 2])      # nudge the whole batch a pixel or two
    return img, label, tf.gather(class_w, label)


train = (tf.data.Dataset.from_tensor_slices((x, y)).shuffle(len(y), seed=7, reshuffle_each_iteration=True)
         .batch(BATCH).map(vary, num_parallel_calls=tf.data.AUTOTUNE).prefetch(2))
val = tf.data.Dataset.from_tensor_slices((xt[..., None].astype(np.float32) / 255.0, yt)).batch(1024)

L = tf.keras.layers


def block(n):
    return [L.Conv2D(n, 3, padding="same", use_bias=False), L.BatchNormalization(), L.ReLU(), L.MaxPooling2D()]


model = tf.keras.Sequential(
    [L.Input((32, 32, 1))]
    + block(24) + block(48) + block(96)
    + [L.Flatten(), L.Dropout(0.3), L.Dense(192, activation="relu"), L.Dropout(0.3), L.Dense(C)])
steps = int(np.ceil(len(y) / BATCH)) * EPOCHS
model.compile(optimizer=tf.keras.optimizers.Adam(tf.keras.optimizers.schedules.CosineDecay(2.5e-3, steps)),
              loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
              metrics=["accuracy"])
model.fit(train, validation_data=val, epochs=EPOCHS, verbose=2)

# ---- How good is it, per data source -------------------------------------------------
logits = model.predict(xt[..., None].astype(np.float32) / 255.0, batch_size=1024, verbose=0)
top5 = np.argsort(-logits, axis=1)[:, :5]
report = {}
for s in sorted(set(st.tolist())):
    m = st == s
    report[s] = {"n": int(m.sum()), "top1": round(float((top5[m, 0] == yt[m]).mean()) * 100, 1),
                 "top5": round(float((top5[m] == yt[m][:, None]).any(1).mean()) * 100, 1)}
confusions = Counter((LABELS[a], LABELS[b]) for a, b in zip(yt.tolist(), top5[:, 0].tolist()) if a != b)
report["most confused (true, read as, count)"] = [(a if a != JUNK else "junk", b if b != JUNK else "junk", n) for (a, b), n in confusions.most_common(40)]
print(json.dumps(report, ensure_ascii=False, indent=1), flush=True)
(WORK / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

# ---- Export: fold batch-norm into the convolutions, store weights as int8 -----------
blob, layers = bytearray(), []


def put(kind, w, b, **extra):
    scale = float(np.abs(w).max()) / 127.0
    q = np.clip(np.round(w / scale), -127, 127).astype(np.int8)
    layers.append({"k": kind, "scale": scale, "w": len(blob), "n": int(q.size), **extra})
    blob.extend(q.tobytes())
    layers[-1]["b"] = len(blob)
    blob.extend(b.astype("<f4").tobytes())
    return q.astype(np.float32) * scale       # what the app will actually compute with


quant = []
seq = [l for l in model.layers]
for i, layer in enumerate(seq):
    if isinstance(layer, L.Conv2D):
        bn = seq[i + 1]
        k = layer.get_weights()[0]                                   # [kh, kw, cin, cout]
        gamma, beta, mean, var = bn.get_weights()
        f = gamma / np.sqrt(var + bn.epsilon)
        w = np.transpose(k * f, (3, 0, 1, 2))                        # [cout, kh, kw, cin]
        quant.append(("conv", put("conv", w, beta - mean * f, cin=int(k.shape[2]), cout=int(k.shape[3])), beta - mean * f))
    elif isinstance(layer, L.Dense):
        k, b = layer.get_weights()                                   # [in, out]
        quant.append(("dense", put("dense", k.T, b, cin=int(k.shape[0]), cout=int(k.shape[1])), b))


def run_quantised(img):
    """Reference forward pass with the exported weights (numpy), mirroring the JavaScript in js/ink.js."""
    a = img.astype(np.float32) / 255.0
    a = a[..., None]
    for kind, w, b in quant:
        if kind == "conv":
            h, wd, _ = a.shape
            p = np.pad(a, ((1, 1), (1, 1), (0, 0)))
            out = np.zeros((h, wd, w.shape[0]), np.float32)
            for dy in range(3):
                for dx in range(3):
                    out += p[dy:dy + h, dx:dx + wd, :] @ w[:, dy, dx, :].T
            a = np.maximum(out + b, 0)
            a = a.reshape(h // 2, 2, wd // 2, 2, -1).max((1, 3))
        else:
            a = a.reshape(-1) @ w.T + b
            if w.shape[0] != C:
                a = np.maximum(a, 0)
    return a


pick = np.random.default_rng(3).choice(len(yt), 300, replace=False)
agree = sum(int(np.argmax(run_quantised(xt[i])) == top5[i, 0]) for i in pick)
print(f"8-bit weights agree with the trained model on {agree}/300 validation images", flush=True)

js = ("/* Handwriting recognition model: weights trained by training/train.py. Generated file.\n"
      "\n"
      "   These weights are licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/);\n"
      "   see MODEL-LICENSE.md and THIRD-PARTY-NOTICES.md. They were trained on:\n"
      "   - EMNIST (Cohen, Afshar, Tapson, van Schaik, 2017), derived from NIST Special Database 19.\n"
      "     Source of the underlying data: National Institute of Standards and Technology (NIST).\n"
      "   - HASYv2 by Martin Thoma (https://doi.org/10.5281/zenodo.259444). Contains information from\n"
      "     HASYv2, which is made available under the Open Database License (ODbL) 1.0.\n"
      "   - CoMNIST by Gregory Vial and contributors (https://github.com/GregVial/CoMNIST), CC BY-SA 4.0.\n"
      "   - characters rendered from fonts on the training machine (no font data is included). */\n"
      "(window.WB = window.WB || {}).INK_MODEL = " +
      json.dumps({"size": 32, "box": 24, "labels": "".join(LABELS), "layers": layers,
                  "data": base64.b64encode(bytes(blob)).decode()}, ensure_ascii=False) + ";\n")
(HERE.parent / "js" / "ink-model.js").write_text(js, encoding="utf-8", newline="\n")

# A few images with their expected reading, for checking the JavaScript against this script.
vec = [{"img": base64.b64encode(xt[i].tobytes()).decode(), "want": int(np.argmax(run_quantised(xt[i]))),
        "logit": float(np.max(run_quantised(xt[i])))} for i in pick[:40]]
(WORK / "testvec.json").write_text(json.dumps(vec), encoding="utf-8")
print(f"Wrote js/ink-model.js ({len(js) / 1024:.0f} KB), {sum(l['n'] for l in layers)} weights", flush=True)
