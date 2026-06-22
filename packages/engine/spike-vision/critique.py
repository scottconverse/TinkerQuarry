import base64, json, sys, urllib.request
intent = "a 40 mm cube with a single 6 mm mounting hole centered on the TOP face"
imgs = sys.argv[1:]
b64 = [base64.b64encode(open(p,'rb').read()).decode() for p in imgs]
prompt = (
  f"You are checking a 3D-printed part against the user's intent: '{intent}'.\n"
  "These are rendered views (isometric, then top-down) of what was actually built.\n"
  "Question: does the built part match the intent? Specifically, is the mounting hole on the "
  "TOP face as intended? If the hole is missing from the top or is on the wrong face, say so "
  "clearly. Answer in 2-3 sentences: MATCHES or SPATIAL ERROR, and why."
)
req = urllib.request.Request("http://localhost:11434/api/generate",
  data=json.dumps({"model":"qwen2.5vl:3b","prompt":prompt,"images":b64,"stream":False}).encode(),
  headers={"Content-Type":"application/json"})
print(json.loads(urllib.request.urlopen(req, timeout=240).read())["response"].strip())
