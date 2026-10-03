import { SCENE_ART } from '../sceneConfig.js';
import '../book.css';

export function EnchantedBook({ onApproach, disabled }) {
  return (
    <div className="book-position">
      <button type="button" className="book-button" onClick={onApproach}
        disabled={disabled} aria-label="走近书本，进入心情日记本" aria-describedby="scene-instruction">
        <span className="book-artboard" aria-hidden="true">
          <img className="book-aura" src={SCENE_ART.book} alt="" draggable="false" />
          <img className="book-body" src={SCENE_ART.book} alt="" draggable="false" />
        </span>
        <span className="book-label">心情日记本</span>
      </button>
    </div>
  );
}
