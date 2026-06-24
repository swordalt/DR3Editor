import { ChevronLeft, ChevronRight } from 'lucide-react';
import EditorLeftMainPanel from './EditorLeftMainPanel';
import EditorLeftEditInfoPanel from './EditorLeftEditInfoPanel';
import EditorLeftBpmPanel from './EditorLeftBpmPanel';
import EditorLeftSpeedPanel from './EditorLeftSpeedPanel';
import EditorLeftCurveSpeedPanel from './EditorLeftCurveSpeedPanel';
import EditorLeftCurvePanel from './EditorLeftCurvePanel';
import EditorLeftUtilityPanel from './EditorLeftUtilityPanel';
import EditorLeftPersistentControls from './EditorLeftPersistentControls';
import { translations } from '../lang';

export default function EditorLeftSidebar(props: any) {
  const {
    isLeftPanelCompact,
    isLeftPanelContentVisible,
    toggleLeftPanelCompact,
  } = props;
  const text = translations;

  return (
    <aside
      className={`${isLeftPanelCompact ? 'w-12 cursor-pointer hover:bg-neutral-800/30' : 'w-64'} h-full shrink-0 border-r border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}
      onClick={isLeftPanelCompact ? toggleLeftPanelCompact : undefined}
    >
      <div className="border-b border-neutral-800">
        <button
          onClick={(event) => {
            event.stopPropagation();
            toggleLeftPanelCompact();
          }}
          className={`flex w-full items-center gap-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white ${isLeftPanelContentVisible ? 'justify-start px-4 py-3 text-xs font-medium' : 'justify-center p-3'}`}
        >
          {isLeftPanelCompact ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {isLeftPanelContentVisible && <span>{text.sidebar.collapseWindow}</span>}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <EditorLeftMainPanel {...props} />
        <EditorLeftEditInfoPanel {...props} />
        <EditorLeftBpmPanel {...props} />
        <EditorLeftSpeedPanel {...props} />
        <EditorLeftCurveSpeedPanel {...props} />
        <EditorLeftCurvePanel {...props} />
        <EditorLeftUtilityPanel {...props} />
      </div>
      <EditorLeftPersistentControls {...props} />
    </aside>
  );
}
