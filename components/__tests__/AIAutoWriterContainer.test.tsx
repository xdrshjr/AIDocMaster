import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import AIAutoWriterContainer from '../AIAutoWriterContainer';

vi.mock('@/lib/logger', () => ({
  logger: {
    component: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../ChatDialog', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="embedded-chat-mock">{props.title}</div>
  ),
}));

vi.mock('../WordEditorPanel', () => {
  const MockWordEditor = forwardRef((props: any, ref) => {
    const contentRef = useRef('<p>initial</p>');

    useImperativeHandle(ref, () => ({
      getEditor: () => ({
        getHTML: () => contentRef.current,
        commands: {
          setContent: (value: string) => {
            contentRef.current = value;
          },
        },
      }),
    }));

    useEffect(() => {
      props.onContentChange?.(contentRef.current);
    }, [props.onContentChange]);

    return <div data-testid="word-editor-panel-mock" />;
  });

  MockWordEditor.displayName = 'MockWordEditorPanel';

  return {
    __esModule: true,
    default: MockWordEditor,
  };
});

describe('AIAutoWriterContainer', () => {
  it('exposes document functions and renders both panels', async () => {
    const handleWidthChange = vi.fn();
    const handleDocFns = vi.fn();

    render(
      <AIAutoWriterContainer
        leftPanelWidth={55}
        onLeftPanelWidthChange={handleWidthChange}
        onDocumentFunctionsReady={handleDocFns}
      />
    );

    expect(screen.getByTestId('word-editor-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('embedded-chat-mock')).toBeInTheDocument();

    await waitFor(() => expect(handleDocFns).toHaveBeenCalled());

    const [getContent, updateContent] = handleDocFns.mock.calls[0];
    expect(getContent()).toBe('<p>initial</p>');
    updateContent('<p>updated</p>');
    expect(getContent()).toBe('<p>updated</p>');
  });

  it('updates width when user drags the resizer', async () => {
    const handleWidthChange = vi.fn();

    render(
      <AIAutoWriterContainer
        leftPanelWidth={55}
        onLeftPanelWidthChange={handleWidthChange}
      />
    );

    const container = screen.getByTestId('auto-writer-container') as HTMLDivElement;
    const resizer = screen.getByTestId('auto-writer-resizer');

    container.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 1000,
      }) as DOMRect;

    fireEvent.mouseDown(resizer, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 650 });

    await waitFor(() => {
      expect(handleWidthChange).toHaveBeenCalled();
    });

    fireEvent.mouseUp(document);
  });
});

