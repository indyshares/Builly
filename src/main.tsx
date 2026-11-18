import {createRoot} from 'react-dom/client';
import './i18n';
import { AppRouter } from './AppRouter';
import './index.css';

createRoot(document.getElementById('root')!).render(<AppRouter />);
