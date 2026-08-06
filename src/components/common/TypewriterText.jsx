import { useState, useEffect } from 'react';

export default function TypewriterText({ text, speed = 14, onComplete }) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
  }, [text]);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);

  // Click to reveal entire text immediately
  const handleSkip = () => {
    setDisplayedText(text);
    setCurrentIndex(text.length);
    if (onComplete) onComplete();
  };

  return (
    <span onClick={handleSkip} style={{ cursor: 'pointer' }}>
      {displayedText}
      {currentIndex < text.length && (
        <span style={{ color: '#3B82F6', fontWeight: 'bold', animation: 'dotBlink 0.6s infinite' }}>|</span>
      )}
    </span>
  );
}
