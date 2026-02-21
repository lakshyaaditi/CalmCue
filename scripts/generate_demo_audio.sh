#!/bin/bash
# Generate demo audio files using macOS `say` command
# Creates two speaker WAV files with intentional overlap for demo purposes

set -e

DEMO_DIR="$(dirname "$0")/../public/demo"
mkdir -p "$DEMO_DIR"

echo "Generating Speaker A audio..."
# Speaker A - uses Alex voice (or default)
say -v Alex \
  "Hey everyone, welcome to the design review meeting. Let's start by going over the user feedback from last sprint. The main complaint was about the navigation being confusing. Hold on, let me finish the overview first. So users also mentioned the loading times were too slow. We need to optimize the dashboard queries. Wait what? We hadn't agreed on the approach yet. That's not necessarily the right approach though. Because we need to consider the data freshness requirements. The third issue was about accessibility. Screen readers can't parse our charts. Exactly. And we need alt text for all the data visualizations. Let me wrap up the feedback list first please. Last thing: users want dark mode. It's been requested a lot. Alright, now let's prioritize these items together." \
  -o "$DEMO_DIR/speakerA.aiff"

echo "Generating Speaker B audio..."
# Speaker B - uses Samantha voice (or default)
say -v Samantha \
  "Oh yeah, I actually had some thoughts on that already. Right, so I was thinking we could simplify the sidebar. Sorry, go ahead. I already started working on that actually! I know but the solution was obvious, just add caching. Why not? It works perfectly fine! Fine, let's discuss it then. Oh that's a good point. We should add ARIA labels. I can take that on. Also about the sidebar thing I mentioned earlier. Okay okay, sorry about that. Dark mode is easy, I can do that in a day." \
  -o "$DEMO_DIR/speakerB.aiff"

echo "Converting to WAV format..."
afconvert -f WAVE -d LEI16 "$DEMO_DIR/speakerA.aiff" "$DEMO_DIR/speakerA.wav"
afconvert -f WAVE -d LEI16 "$DEMO_DIR/speakerB.aiff" "$DEMO_DIR/speakerB.wav"

# Clean up AIFF files
rm -f "$DEMO_DIR/speakerA.aiff" "$DEMO_DIR/speakerB.aiff"

echo "Demo audio generated successfully!"
echo "  - $DEMO_DIR/speakerA.wav"
echo "  - $DEMO_DIR/speakerB.wav"
