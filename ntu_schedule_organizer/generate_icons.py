import os
from PIL import Image, ImageDraw

os.makedirs('icons', exist_ok=True)

def create_icon(size, filename):
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw rounded rectangle background (Indigo to Purple gradient effect)
    margin = int(size * 0.05)
    rect = [margin, margin, size - margin, size - margin]
    radius = int(size * 0.2)
    
    draw.rounded_rectangle(rect, radius=radius, fill=(99, 102, 241, 255), outline=(168, 85, 247, 255), width=max(1, int(size * 0.04)))

    # Draw calendar / checkmark icon
    padding = int(size * 0.25)
    c_left = padding
    c_top = padding + int(size * 0.08)
    c_right = size - padding
    c_bottom = size - padding + int(size * 0.08)

    # Top calendar bar
    draw.rectangle([c_left, c_top, c_right, c_top + int(size * 0.12)], fill=(255, 255, 255, 255))
    # Calendar body
    draw.rectangle([c_left, c_top + int(size * 0.15), c_right, c_bottom], fill=(255, 255, 255, 180))

    # Grid dots
    dot_size = max(2, int(size * 0.08))
    draw.ellipse([c_left + int(size * 0.08), c_top + int(size * 0.22), c_left + int(size * 0.08) + dot_size, c_top + int(size * 0.22) + dot_size], fill=(99, 102, 241, 255))
    draw.ellipse([c_right - int(size * 0.16), c_top + int(size * 0.22), c_right - int(size * 0.16) + dot_size, c_top + int(size * 0.22) + dot_size], fill=(239, 68, 68, 255))

    img.save(os.path.join('icons', filename))
    print(f"Generated icons/{filename}")

create_icon(16, 'icon16.png')
create_icon(48, 'icon48.png')
create_icon(128, 'icon128.png')
