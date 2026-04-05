from PIL import Image
import os

source = r'C:\Users\rapha\.gemini\antigravity\brain\83ac1b1c-d361-47f7-b9c1-950d34c9fdc3\orv_reader_icon_1775386331027.png'
dest_dir = r'C:\Users\rapha\Documents\ORV\epub_web_reader'

img = Image.open(source)

# Create 512x512
img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(os.path.join(dest_dir, 'icon-512.png'))

# Create 192x192
img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save(os.path.join(dest_dir, 'icon-192.png'))

print("Icons resized and saved successfully.")
