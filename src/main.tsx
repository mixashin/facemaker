import { render } from 'preact';
import { App } from './app/App';
import { initTheme } from './app/themes';
import { initTutorialSeen } from './app/tutorialState';
import { theme, tutorialSeen } from './app/state';
import './app/styles.css';

theme.value = initTheme(); // before first paint, no theme flash
tutorialSeen.value = initTutorialSeen();
render(<App />, document.getElementById('app')!);
