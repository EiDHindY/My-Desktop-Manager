import { fetchDesktops } from './shared_backend/helpers/desktop_utils';
const desktops = fetchDesktops();
console.log(desktops.slice(0, 3));
