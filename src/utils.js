/*
	Several of the jmarkdown extensions need to evaluate code in a shared
	instance of runInThisContext.  This utility module makes that possible.
*/
import { runInThisContext } from 'vm';


export { runInThisContext };