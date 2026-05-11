import { ChevronLeft, ChevronRight } from 'lucide-react';
import EditorLeftMainPanel from './EditorLeftMainPanel';
import EditorLeftEditInfoPanel from './EditorLeftEditInfoPanel';
import EditorLeftBpmPanel from './EditorLeftBpmPanel';
import EditorLeftSpeedPanel from './EditorLeftSpeedPanel';
import EditorLeftCurvePanel from './EditorLeftCurvePanel';
import EditorLeftUtilityPanel from './EditorLeftUtilityPanel';
import { translations } from '../lang';

export default function EditorLeftSidebar(props: any) {
  const {
    isLeftPanelCompact,
    isLeftPanelContentVisible,
    toggleLeftPanelCompact,
  } = props;
  const text = translations;

  return (
    <aside className={`${isLeftPanelCompact ? 'w-12' : 'w-64'} shrink-0 border-r border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}>
      <div className={`p-2 border-b border-neutral-800 flex ${isLeftPanelContentVisible ? 'justify-start' : 'justify-center'}`}>
        <button
          onClick={toggleLeftPanelCompact}
          className={`flex items-center gap-2 rounded text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors ${isLeftPanelContentVisible ? 'px-2 py-1 text-xs font-medium' : 'p-1'}`}
        >
          {isLeftPanelCompact ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {isLeftPanelContentVisible && <span>{text.sidebar.collapseWindow}</span>}
        </button>
      </div>

      <EditorLeftMainPanel {...props} />
      <EditorLeftEditInfoPanel {...props} />
      <EditorLeftBpmPanel {...props} />
      <EditorLeftSpeedPanel {...props} />
      <EditorLeftCurvePanel {...props} />
      <EditorLeftUtilityPanel {...props} />
    </aside>
  );
}
