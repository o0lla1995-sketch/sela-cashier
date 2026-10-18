/**
 * @format
 */

/**
 * @format
 */

import {I18nManager, AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

// عربي أولاً — نفس أسلوب تطبيق سيلا الأم.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

AppRegistry.registerComponent(appName, () => App);
