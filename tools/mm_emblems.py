"""Draw the Market Map's topic emblems with fal (one square picture per question category).

Run by .github/workflows/mm-emblems.yml (by hand). Needs FAL_KEY; prints statuses, never the key.
Writes prototypes/market-map/img/<slug>.jpg at 384 px; the workflow uploads them for review before anyone commits them.
"""
import io, json, os, sys, time, urllib.request

MODEL = os.environ.get("MM_IMAGE_MODEL", "openai/gpt-image-2")
OUT = os.path.join(os.path.dirname(__file__), "..", "prototypes", "market-map", "img")
STYLE = ("One of a matched set of six museum catalogue photographs. A single object, centred, on a seamless near-black "
         "charcoal background, low-key studio light from the upper left, soft shadow, slight film grain, muted colours "
         "with one warm accent, square crop with generous empty space around the object. No text, no lettering, no logos, "
         "no flags, no people, no hands. The object: ")
TOPICS = {
    "economy": "a short stack of worn cloth-bound ledger books with a single brass balance weight resting on top.",
    "energy": "a heavy cast-iron pipeline valve wheel, painted faded red, mounted on a short length of steel pipe.",
    "geopolitics": "a small antique desk globe in dark tones, a single red thread stretched taut across it between two brass pins.",
    "tech": "a polished silicon wafer standing upright in a simple dark holder, catching a thin line of light across its surface.",
    "markets": "a coil of paper ticker tape spilling from an old brass stock ticker machine dome.",
    "politics": "a plain wooden ballot box with a narrow slot in its lid and a small brass padlock.",
}


def fal(url, body=None, key=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 method="POST" if body is not None else "GET",
                                 headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def draw(prompt, key):
    sub = fal(f"https://queue.fal.run/{MODEL}", {"prompt": prompt, "num_images": 1, "image_size": "square_hd",
                                                  "quality": "high", "output_format": "jpeg"}, key)
    t0 = time.time()
    while True:
        st = fal(sub["status_url"], None, key).get("status")
        if st == "COMPLETED":
            break
        if st not in ("IN_QUEUE", "IN_PROGRESS") or time.time() - t0 > 600:
            raise RuntimeError(f"fal said {st}")
        time.sleep(5)
    res = fal(sub["response_url"], None, key)
    with urllib.request.urlopen(res["images"][0]["url"], timeout=120) as r:
        return r.read()


def main():
    key = os.environ.get("FAL_KEY", "").strip()
    if not key:
        sys.exit("FAL_KEY is not set.")
    from PIL import Image
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:] or list(TOPICS)
    for slug in only:
        try:
            img = Image.open(io.BytesIO(draw(STYLE + TOPICS[slug], key))).convert("RGB").resize((384, 384), Image.LANCZOS)
            img.save(os.path.join(OUT, slug + ".jpg"), quality=84, optimize=True, progressive=True)
            print("drew", slug)
        except Exception as e:  # the status, never the key
            print("failed", slug, type(e).__name__, getattr(e, "code", ""), str(e)[:120])


if __name__ == "__main__":
    main()
