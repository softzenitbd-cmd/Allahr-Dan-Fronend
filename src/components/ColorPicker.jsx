import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  hexToRgb, rgbToHex, hexToHsv, hsvToHex, hsvToRgb,
  rgbToHsl, rgbToCmyk, isValidHex,
} from '../utils/accent';
import './ColorPicker.css';

/**
 * A colour picker in the shape everyone already knows: a saturation/brightness
 * field, a hue rail under it, and the hex you can read out or paste in.
 *
 * The state kept here is HSV, not hex. That is deliberate -- dragging to pure
 * black or pure white destroys the hue in RGB, so a picker that stored hex
 * would forget which colour you were on and snap the handle back to red the
 * moment you passed through the bottom edge. Holding HSV keeps the rail still
 * while the field is dragged.
 */

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const round = (n) => Math.round(n);

const ColorPicker = ({ value, onChange, language = 'en' }) => {
  const [hsv, setHsv] = useState(() => hexToHsv(value) || { h: 210, s: 80, v: 85 });
  const [hexText, setHexText] = useState(value || '#0284c7');
  const [copied, setCopied] = useState(false);

  const areaRef = useRef(null);
  const hueRef = useRef(null);
  // The updater function passed to setState runs during render, so the parent
  // must not be told about the new colour from inside one. This ref carries
  // the current value so the change can be applied and announced outside it.
  const hsvRef = useRef(hsv);
  // What this picker last handed out, so a value coming back in from the
  // parent is not mistaken for someone choosing a different colour.
  const emitted = useRef(value);

  // Follow the value when it is changed from outside -- a swatch on the plate,
  // or a reset -- but never while we are the ones driving it.
  useEffect(() => {
    if (!value || value === emitted.current) return;
    const next = hexToHsv(value);
    if (next) {
      hsvRef.current = next;
      setHsv(next);
      setHexText(value);
    }
  }, [value]);

  const applyHsv = useCallback((next) => {
    hsvRef.current = next;
    setHsv(next);
    const hex = hsvToHex(next);
    emitted.current = hex;
    setHexText(hex);
    onChange?.(hex);
  }, [onChange]);

  const setFromPointer = useCallback((event, kind) => {
    const el = kind === 'area' ? areaRef.current : hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    if (kind === 'area') {
      applyHsv({
        ...hsvRef.current,
        s: clamp01((event.clientX - rect.left) / rect.width) * 100,
        v: (1 - clamp01((event.clientY - rect.top) / rect.height)) * 100,
      });
    } else {
      applyHsv({
        ...hsvRef.current,
        h: clamp01((event.clientX - rect.left) / rect.width) * 360,
      });
    }
  }, [applyHsv]);

  // Pointer capture keeps the drag alive when the cursor leaves the box, which
  // is what makes dragging to a corner feel right rather than stopping short.
  const startDrag = (kind) => (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setFromPointer(event, kind);

    const move = (e) => setFromPointer(e, kind);
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const nudge = (kind) => (event) => {
    const step = event.shiftKey ? 10 : 1;
    const prev = hsvRef.current;
    const next = { ...prev };

    if (kind === 'hue') {
      if (event.key === 'ArrowLeft') next.h = Math.max(0, prev.h - step);
      else if (event.key === 'ArrowRight') next.h = Math.min(360, prev.h + step);
      else return;
    } else {
      if (event.key === 'ArrowLeft') next.s = Math.max(0, prev.s - step);
      else if (event.key === 'ArrowRight') next.s = Math.min(100, prev.s + step);
      else if (event.key === 'ArrowUp') next.v = Math.min(100, prev.v + step);
      else if (event.key === 'ArrowDown') next.v = Math.max(0, prev.v - step);
      else return;
    }

    event.preventDefault();
    applyHsv(next);
  };

  const onHexInput = (raw) => {
    setHexText(raw);
    const withHash = raw.startsWith('#') ? raw : `#${raw}`;
    if (isValidHex(withHash)) {
      const next = hexToHsv(withHash);
      if (next) {
        hsvRef.current = next;
        setHsv(next);
        emitted.current = rgbToHex(hexToRgb(withHash));
        onChange?.(emitted.current);
      }
    }
  };

  const copyHex = async () => {
    try {
      await navigator.clipboard.writeText(hsvToHex(hsv).toUpperCase());
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked; the field is selectable anyway */
    }
  };

  const hex = hsvToHex(hsv);
  const rgb = hsvToRgb(hsv);
  const hsl = rgbToHsl(rgb);
  const cmyk = rgbToCmyk(rgb);
  const hueHex = hsvToHex({ h: hsv.h, s: 100, v: 100 });
  // The handle needs to stay visible on both a white corner and a black one.
  const handleOnLight = hsv.v > 60 && hsv.s < 55;

  const readouts = [
    { label: 'RGB', text: `${rgb.r}, ${rgb.g}, ${rgb.b}` },
    { label: 'CMYK', text: `${round(cmyk.c)}%, ${round(cmyk.m)}%, ${round(cmyk.y)}%, ${round(cmyk.k)}%` },
    { label: 'HSV', text: `${round(hsv.h)}°, ${round(hsv.s)}%, ${round(hsv.v)}%` },
    { label: 'HSL', text: `${round(hsl.h)}°, ${round(hsl.s)}%, ${round(hsl.l)}%` },
  ];

  return (
    <div className="colour-picker">
      <div className="cp-top">
        {/* The colour as it stands, big enough to judge */}
        <div className="cp-preview" style={{ background: hex } } />

        {/* Saturation across, brightness down */}
        <div
          ref={areaRef}
          className="cp-area"
          style={{ background: hueHex }}
          onPointerDown={startDrag('area')}
          onKeyDown={nudge('area')}
          role="slider"
          tabIndex={0}
          aria-label={language === 'bn' ? 'রঙের গাঢ়তা ও উজ্জ্বলতা' : 'Colour saturation and brightness'}
          aria-valuetext={`${round(hsv.s)}% saturation, ${round(hsv.v)}% brightness`}
        >
          <span className="cp-area-white" />
          <span className="cp-area-black" />
          <span
            className={`cp-handle ${handleOnLight ? 'on-light' : ''}`}
            style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
          />
        </div>
      </div>

      {/* Hue */}
      <div
        ref={hueRef}
        className="cp-hue"
        onPointerDown={startDrag('hue')}
        onKeyDown={nudge('hue')}
        role="slider"
        tabIndex={0}
        aria-label={language === 'bn' ? 'রঙ' : 'Hue'}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={round(hsv.h)}
      >
        <span className="cp-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: hueHex }} />
      </div>

      {/* Hex */}
      <div className="cp-hex">
        <span className="cp-hex-label">HEX</span>
        <input
          value={hexText}
          onChange={(e) => onHexInput(e.target.value)}
          onBlur={() => setHexText(hex)}
          spellCheck={false}
          aria-label="Hex colour code"
        />
        <button type="button" onClick={copyHex} title={language === 'bn' ? 'কপি করুন' : 'Copy'}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>

      {/* The same colour in the notations people compare against */}
      <div className="cp-readouts">
        {readouts.map((r) => (
          <div className="cp-readout" key={r.label}>
            <span className="cp-readout-label">{r.label}</span>
            <span className="cp-readout-value">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ColorPicker;
