import { SCENE_ART } from '../sceneConfig.js';
import '../book.css';

function Leaf({ index, cover = false }) {
  return (
    <span className={`book-leaf ${cover ? 'book-cover' : `book-page book-page-${index}`}`}>
      <span className={`leaf-face leaf-front ${cover ? 'cover-outside' : 'paper-surface'}`}>
        <img src={cover ? SCENE_ART.bookClosed : SCENE_ART.paper} alt="" draggable="false" />
      </span>
      <span className={`leaf-face leaf-back ${cover ? 'cover-inside' : 'paper-surface'}`}>
        <img src={SCENE_ART.paper} alt="" draggable="false" />
      </span>
      {cover ? <span className="cover-board-edge" /> : null}
    </span>
  );
}

export function EnchantedBook({ onOpen, disabled }) {
  return (
    <div className="book-position">
      <button type="button" className="book-button" onClick={onOpen}
        disabled={disabled} aria-label="打开书本，走进心情日记本" aria-describedby="scene-instruction">
        <span className="book-artboard" aria-hidden="true">
          <img className="book-aura" src={SCENE_ART.bookOpen} alt="" draggable="false" />
          <span className="book-camera">
            <img className="book-body" src={SCENE_ART.bookOpen} alt="" draggable="false" />
            <img className="book-fixed-rim" src={SCENE_ART.bookClosed} alt="" draggable="false" />
            <span className="book-seam" />
            <Leaf index={3} />
            <Leaf index={2} />
            <Leaf index={1} />
            <Leaf cover />
          </span>
        </span>
        <span className="book-label">心情日记本</span>
      </button>
    </div>
  );
}
