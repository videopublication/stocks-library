import pywinauto
from pywinauto.findwindows import find_windows

hwnds = find_windows(title_re='(?i).*Artlist.*|.*Chrome.*', backend='uia')
if not hwnds:
    hwnds = find_windows(class_name='Chrome_WidgetWin_1', backend='uia')

print('Found HWNDs:', hwnds)
if hwnds:
    app = pywinauto.Application(backend='uia').connect(handle=hwnds[0])
    win = app.window(handle=hwnds[0])
    print('Window title:', win.window_text())
    
    try:
        doc = win.child_window(control_type='Document', found_index=0)
        children = doc.descendants()
    except Exception as e:
        print('Document descendants failed, using win.descendants():', e)
        children = win.descendants()
        
    print(f'Total UIA descendants: {len(children)}')
    for c in children:
        try:
            name = c.window_text()
            ctype = c.element_info.control_type
            rect = c.rectangle()
            if any(k in name.lower() for k in ['play', 'download', 'stem', 'voyage', 'sam lux', 'wav', 'option', 'sam']):
                print(f'[{ctype}] Name="{name}" Rect={rect}')
        except Exception:
            pass
