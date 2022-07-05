import { isUsed } from "./functions";
import {doThings} from './corp-user';
export function handler() {
    isUsed();
    doThings();
}