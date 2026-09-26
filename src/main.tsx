import { render } from 'preact';
import { App } from './app/App';
import { initTheme } from './app/themes';
import { theme } from './app/state';
import './app/styles.css';

theme.value = initTheme(); // before first paint, no theme flash
render(<App />, document.getElementById('app')!);
