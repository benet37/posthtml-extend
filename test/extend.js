import path from 'path';
import expect from 'expect';
import posthtml from 'posthtml';
import proxyquire from 'proxyquire';
import Promise from 'bluebird';

let mfs = {
    _files: {},

    readFileSync(filePath) {
        return this._files[filePath];
    },

    writeFileSync(filePath, content) {
        const fullPath = path.resolve(filePath);
        this._files[fullPath] = content;
    }
};

const extend = proxyquire('../lib/extend', {
    fs: mfs
}).default;


describe('Extend', () => {
    beforeEach(() => {
        mfs._files = {};
    });


    it('should render default block\'s content if layout is not extended', () => {
        return init('<html><block name="content">content</block></html>')
            .then(html => expect(html).toBe('<html>content</html>'));
    });


    it('should extend layout', () => {
        mfs.writeFileSync('./layout.html', `
            <head><block name="head">head</block></head>
            <body><block name="body">body</block></body>
            <sidebar><block name="sidebar"></block></sidebar>
            <div><block name="ad">ad</block></div>
            <footer><block name="footer">footer</block></footer>
        `);

        return init(`
            <extends src="layout.html">
                <block name="ad"></block>
                <block name="head"><title>hello world!</title></block>
                <block name="body">Some body content</block>
            </extends>
        `).then(html => {
            expect(html).toBe(cleanHtml(`
                <head><title>hello world!</title></head>
                <body>Some body content</body>
                <sidebar></sidebar>
                <div></div>
                <footer>footer</footer>
            `));
        });
    });

    it('should extend layout with plugin', () => {
        mfs.writeFileSync('./layout.html', `
            <block name="content"></block>
        `);

        const options = {
            plugins: [
                require('posthtml-expressions')({ locals: { foo: 'bar'} })
            ]
        };

        return init(`
            <extends src="layout.html">
                <if condition="foo === 'bar'">
                  <block name="content">content value foo equal bar</block>
                </if>

                <if condition="foo !== 'bar'">
                    <block name="content"> value foo not equal bar</block>
                </if>
            </extends>
        `, options).then(html => {
            expect(html).toBe(cleanHtml('content value foo equal bar'));
        });
    });


    it('should extend inherited layout', () => {
        mfs.writeFileSync('./base.html', `
            <html>
                <head><block name="head"><title></title></block></head>
                <body><block name="body"></block></body>
                <footer><block name="footer">footer</block></footer>
            </html>
        `);

        mfs.writeFileSync('./page.html', `
            <extends src="base.html">
                <block name="footer">copyright</block>
                <block name="body">default content</block>
            </extends>
            <!-- page end -->
        `);

        return init(`
            <!-- page start -->
            <extends src="page.html">
                <block name="body">page content</block>
            </extends>
        `).then(html => {
            expect(html).toBe(cleanHtml(`
                <!-- page start -->
                <html>
                    <head><title></title></head>
                    <body>page content</body>
                    <footer>copyright</footer>
                </html>
                <!-- page end -->
            `));
        });
    });


    it('should append and prepend content', () => {
        mfs.writeFileSync('./layout.html', `
            <head><block name="head"><style></style></block></head>
            <body><block name="body">body</block></body>
            <footer><block name="footer">2015</block></footer>
        `);

        return init(`
            <extends src="layout.html">
                <block name="head" type="prepend"><title>hello!</title></block>
                <block name="body">Some body content</block>
                <block name="footer" type="append">—2016</block>
            </extends>
        `).then(html => {
            expect(html).toBe(cleanHtml(`
                <head><title>hello!</title><style></style></head>
                <body>Some body content</body>
                <footer>2015—2016</footer>
            `));
        });
    });


    it('should remove unexpected content from <extends>', () => {
        mfs.writeFileSync('./layout.html', '<block name="content"></block>');

        return init(`
            <extends src="layout.html">
                <div>some other content</div>
                <block name="content">hello!</block>
                blah-blah
            </extends>
        `).then(html => {
            expect(html).toBe(cleanHtml('hello!'));
        });
    });


    it('should throw an error if <extends> has no "src"', () => {
        return assertError(
            init('<extends><block name="content"></block></extends>'),
            '[posthtml-extend] <extends> has no "src"'
        );
    });


    it('should throw an error if <block> has no "name"', () => {
        mfs.writeFileSync('./test/base.html', 'some content');
        const options = {root: './test'};

        return Promise.all([
            assertError(
                init('<extends src="base.html"><block>hello!</block></extends>', options),
                '[posthtml-extend] <block> has no "name"'
            ),

            assertError(
                init('<block>hello!</block>', options),
                '[posthtml-extend] <block> has no "name"'
            ),

            assertError(
                init('<block class="">hello!</block>', options),
                '[posthtml-extend] <block> has no "name"'
            )
        ]);
    });


    it('should throw an error if <block> is unexpected', () => {
        mfs.writeFileSync('./layout.html', '<block name="content"></block>');

        return assertError(
            init('<extends src="layout.html"><block name="head"></block></extends>'),
            '[posthtml-extend] Unexpected block "head"'
        );
    });
});

describe('Messages', () => {
    it('should have proper `result` structure', () => {
        mfs.writeFileSync('./layout.html', `
            <head><block name="head">head</block></head>
            <body><block name="body">body</block></body>
        `);

        return init(
            `
                <extends src="layout.html">
                    <block name="head"><title>hello world!</title></block>
                    <block name="body">Some body content</block>
                </extends>
            `,
            {},
            (result) => expect(result).toEqual({
                html: result.html,
                tree: result.tree,
                messages: result.messages
            })
        );

    });

    it('should have proper element within `messages`', () => {
        const fileName = 'layout.html';
        const filePath = `./${fileName}`;

        mfs.writeFileSync(filePath, `
            <head><block name="head">head</block></head>
            <body><block name="body">body</block></body>
        `);

        return init(`
            <extends src="${fileName}">
                <block name="head"><title>hello world!</title></block>
                <block name="body">Some body content</block>
            </extends>
        `, {
            from: 'from'
        }, (result) => expect(result.messages[0]).toEqual({
            type: 'dependency',
            file: path.resolve(filePath),
            from: 'from'
        }));

    });
});


function assertError(promise, expectedErrorMessage) {
    return promise
        .catch(error => error.message)
        .then(errorMessage => expect(errorMessage).toBe(expectedErrorMessage));
}


function init(html, options = {}, callback) {
    const fn = typeof callback === 'function' ? callback : (result => cleanHtml(result.html));

    return posthtml([extend(options)])
        .process(html)
        .then(fn);
}


function cleanHtml(html) {
    return html.replace(/>\s+</gm, '><').trim();
}
